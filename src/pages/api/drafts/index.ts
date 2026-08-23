import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { canAccessEntry, canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { getFromR2 } from '../../../lib/r2';
import { draftDiaryEntry, canSendToVision } from '../../../lib/diary-ai';
import type { DraftPhoto, DraftTranscript, RosterPerson } from '../../../lib/diary-ai';
import type { DiaryDraft, DiaryDraftPayload } from '../../../types/diary';

export const prerender = false;

/**
 * How many photos one draft may carry.
 *
 * Vision tokens are the expensive half of this call and a phone burst can be
 * forty photos deep. Twelve is enough to cover a day's work; beyond that the
 * cost climbs without the classification getting any better. What is *not*
 * acceptable is quietly dropping the rest — the response says exactly what was
 * used and what was left out, so the UI can offer a second draft for the others.
 */
const MAX_PHOTOS = 12;

/** A photo that was available but not sent, and why. Always reported, never silent. */
interface SkippedPhoto {
  id: string;
  reason: string;
}

interface VoiceNoteRow {
  id: string;
  entry_id: string | null;
  project_id: string | null;
  transcript: string | null;
  file_id: string | null;
  created_at: string;
  status: string;
}

interface FileRow {
  id: string;
  entry_id: string;
  r2_key: string;
  mime_type: string;
  caption: string | null;
  ai_caption: string | null;
}

/** Build the `?, ?, ?` list for an IN clause. Values still go through bind(). */
function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

/** Accept only plausible ids from the body, so a stray object can't reach the SQL binder. */
function idList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64);
  return ids.length ? [...new Set(ids)] : [];
}

/**
 * POST /api/drafts
 *
 * Body: { project_id, entry_id?, voice_note_ids?, file_ids? }
 *
 * Turns the day's recordings and photographs into a *proposed* structured
 * entry. It never writes to the diary: the draft sits in diary_drafts until a
 * human confirms it through the ordinary entry save path.
 *
 * A model failure still returns 200 with the row, marked failed — the same
 * contract as a failed summary narrative. The UI needs to say "couldn't draft
 * this one, write it by hand"; an error status would just look like the app
 * being broken and would lose the record that we tried.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  // A client is outside the business. They never author site records and never
  // spend the business's AI budget — turned away before anything else runs.
  if (locals.role === 'client' || !hasCap(locals, 'edit_diary')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    project_id?: unknown;
    entry_id?: unknown;
    voice_note_ids?: unknown;
    file_ids?: unknown;
  } | null;

  const projectId = typeof body?.project_id === 'string' ? body.project_id : null;
  const entryId = typeof body?.entry_id === 'string' && body.entry_id ? body.entry_id : null;
  if (!projectId) return Response.json({ error: 'project_id is required' }, { status: 400 });

  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // An entry is authorised on its own terms, and must belong to the project the
  // caller named — otherwise a reachable project id would be a way to draft
  // against someone else's day.
  if (entryId) {
    const entryProject = await canAccessEntry(env.DB, locals, entryId);
    if (!entryProject || entryProject !== projectId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI drafting is not configured' }, { status: 503 });
  }

  const project = await queryOne<{ id: string; name: string; address: string | null; org_id: string | null }>(
    env.DB,
    'SELECT id, name, address, org_id FROM projects WHERE id = ?',
    [projectId]
  );
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  // ── Transcripts ──────────────────────────────────────────────────────────
  const requestedNotes = idList(body?.voice_note_ids);
  let notes: VoiceNoteRow[];

  if (requestedNotes && requestedNotes.length) {
    // Scoped to the project in SQL rather than filtered afterwards: the caller's
    // list of ids is a request, not a claim about who owns them.
    notes = await queryAll<VoiceNoteRow>(
      env.DB,
      `SELECT id, entry_id, project_id, transcript, file_id, created_at, status
         FROM voice_notes
        WHERE id IN (${placeholders(requestedNotes.length)})
          AND project_id = ?
        ORDER BY created_at ASC`,
      [...requestedNotes, projectId]
    );
  } else if (entryId) {
    // The sensible default: everything that was said about this day.
    notes = await queryAll<VoiceNoteRow>(
      env.DB,
      `SELECT id, entry_id, project_id, transcript, file_id, created_at, status
         FROM voice_notes
        WHERE entry_id = ? AND status = 'transcribed'
        ORDER BY created_at ASC`,
      [entryId]
    );
  } else {
    return Response.json(
      { error: 'Provide entry_id, or the voice_note_ids to draft from' },
      { status: 400 }
    );
  }

  const usableNotes = notes.filter((n) => n.status === 'transcribed' && n.transcript && n.transcript.trim());

  // Photos alone cannot say what happened, who was there, or why work stopped.
  // A draft built from them would be invention, which is the one thing this
  // feature must never produce — so we refuse rather than guess.
  if (usableNotes.length === 0) {
    return Response.json(
      {
        error: 'No transcript to draft from. Record a note first — a draft made from photos alone would be guesswork.',
        voice_notes_available: notes.length,
      },
      { status: 400 }
    );
  }

  // ── Photos ───────────────────────────────────────────────────────────────
  const requestedFiles = idList(body?.file_ids);
  let candidates: FileRow[] = [];

  if (requestedFiles && requestedFiles.length) {
    candidates = await queryAll<FileRow>(
      env.DB,
      `SELECT f.id, f.entry_id, f.r2_key, f.mime_type, f.caption, f.ai_caption
         FROM entry_files f
         JOIN diary_entries e ON e.id = f.entry_id
        WHERE f.id IN (${placeholders(requestedFiles.length)})
          AND e.project_id = ?
        ORDER BY COALESCE(f.taken_at, f.created_at) ASC`,
      [...requestedFiles, projectId]
    );
  } else if (entryId && requestedFiles === null) {
    // Default to the day's own photos. An explicitly empty file_ids array means
    // "no photos", and is honoured as such.
    candidates = await queryAll<FileRow>(
      env.DB,
      `SELECT f.id, f.entry_id, f.r2_key, f.mime_type, f.caption, f.ai_caption
         FROM entry_files f
         JOIN diary_entries e ON e.id = f.entry_id
        WHERE f.entry_id = ? AND e.project_id = ?
        ORDER BY COALESCE(f.taken_at, f.created_at) ASC`,
      [entryId, projectId]
    );
  }

  const skipped: SkippedPhoto[] = [];

  // HEIC off an iPhone and PDF delivery notes are legitimate uploads that simply
  // are not vision inputs. They are reported, not silently ignored.
  const sendable = candidates.filter((f) => {
    if (canSendToVision(f.mime_type)) return true;
    skipped.push({ id: f.id, reason: `${f.mime_type} cannot be read by the model` });
    return false;
  });

  const photosAvailable = sendable.length;
  const chosen = sendable.slice(0, MAX_PHOTOS);
  for (const over of sendable.slice(MAX_PHOTOS)) {
    skipped.push({ id: over.id, reason: `over the ${MAX_PHOTOS}-photo limit for one draft` });
  }

  const photos: DraftPhoto[] = [];
  for (const file of chosen) {
    const object = await getFromR2(env.R2, file.r2_key);
    if (!object) {
      skipped.push({ id: file.id, reason: 'missing from storage' });
      continue;
    }
    photos.push({
      id: file.id,
      data: await object.arrayBuffer(),
      mimeType: file.mime_type,
      caption: file.caption ?? file.ai_caption ?? undefined,
    });
  }

  // ── Known names to match against ─────────────────────────────────────────
  const orgId = project.org_id ?? locals.org?.id ?? null;

  const supplierRows = await queryAll<{ name: string }>(
    env.DB,
    'SELECT name FROM suppliers WHERE org_id = ? ORDER BY name',
    [orgId ?? '']
  );

  // People on this project's rota are the ones most likely to be named today,
  // so they are flagged — but the whole active roster goes across, because site
  // teams move around and a name from another job is still a real person.
  const rosterRows = await queryAll<{ name: string; company: string | null; role: string | null; on_project: number }>(
    env.DB,
    `SELECT p.name, p.company, p.role,
            (SELECT COUNT(*) FROM project_rota r
              WHERE r.person_id = p.id AND r.project_id = ?) AS on_project
       FROM people p
      WHERE p.org_id = ? AND p.active = 1
      ORDER BY p.name`,
    [projectId, orgId ?? '']
  );
  const roster: RosterPerson[] = rosterRows.map((p) => ({
    name: p.name,
    company: p.company,
    role: p.role,
    on_project: p.on_project > 0,
  }));

  // ── The date this draft is for ───────────────────────────────────────────
  const entryDate = entryId
    ? (await queryOne<{ date: string }>(env.DB, 'SELECT date FROM diary_entries WHERE id = ?', [entryId]))?.date
    : null;
  const date = entryDate ?? new Date().toISOString().slice(0, 10);

  const transcripts: DraftTranscript[] = usableNotes.map((n) => ({
    text: n.transcript!,
    file_id: n.file_id,
    recorded_at: n.created_at,
  }));

  // ── Record the attempt, then make it ─────────────────────────────────────
  // The row is inserted before the call so a crash mid-flight leaves evidence
  // that a draft was attempted, rather than nothing at all.
  const draftId = generateId();
  const createdAt = now();
  const source = photos.length ? 'both' : 'voice';

  await execute(
    env.DB,
    `INSERT INTO diary_drafts (id, org_id, project_id, entry_id, source, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [draftId, orgId, projectId, entryId, source, user.id, createdAt]
  );

  let payload: DiaryDraftPayload | null = null;
  try {
    payload = await draftDiaryEntry(env.ANTHROPIC_API_KEY, {
      project: { name: project.name, address: project.address },
      date,
      transcripts,
      photos,
      suppliers: supplierRows.map((s) => s.name),
      roster,
    });
    await execute(
      env.DB,
      `UPDATE diary_drafts SET payload = ?, status = 'pending', error = NULL WHERE id = ?`,
      [JSON.stringify(payload), draftId]
    );
  } catch (err) {
    // The day's words are not lost — the transcripts remain. The draft records
    // why it couldn't be structured, so the UI offers "write it by hand" and a
    // retry rather than a spinner that never ends.
    await execute(
      env.DB,
      `UPDATE diary_drafts SET status = 'failed', error = ? WHERE id = ?`,
      [err instanceof Error ? err.message : 'Drafting failed', draftId]
    );
  }

  const draft = await queryOne<DiaryDraft>(env.DB, 'SELECT * FROM diary_drafts WHERE id = ?', [draftId]);

  return Response.json({
    draft,
    payload,
    used: {
      voice_notes: usableNotes.length,
      voice_notes_available: notes.length,
      photos: photos.length,
      photos_available: photosAvailable,
      photos_skipped: skipped,
    },
  });
};

/**
 * GET /api/drafts?entry_id= | ?project_id=
 *
 * Newest first: a draft is a thing you have just made and are about to act on,
 * so the one at the top is almost always the one being asked for.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  if (locals.role === 'client' || !hasCap(locals, 'edit_diary')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const entryId = url.searchParams.get('entry_id');
  const projectId = url.searchParams.get('project_id');

  if (entryId) {
    // The entry's own project decides access, not any project_id also supplied.
    if (!(await canAccessEntry(env.DB, locals, entryId))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drafts = await queryAll<DiaryDraft>(
      env.DB,
      'SELECT * FROM diary_drafts WHERE entry_id = ? ORDER BY created_at DESC',
      [entryId]
    );
    return Response.json({ drafts });
  }

  if (projectId) {
    if (!(await canAccessProject(env.DB, locals, projectId))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drafts = await queryAll<DiaryDraft>(
      env.DB,
      'SELECT * FROM diary_drafts WHERE project_id = ? ORDER BY created_at DESC',
      [projectId]
    );
    return Response.json({ drafts });
  }

  return Response.json({ error: 'entry_id or project_id is required' }, { status: 400 });
};
