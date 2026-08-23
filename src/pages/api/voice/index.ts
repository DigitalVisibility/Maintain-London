import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { canAccessEntry } from '../../../lib/access';
import { uploadToR2 } from '../../../lib/r2';
import { validateAudio, buildVoiceKey, normaliseAudioType } from '../../../lib/transcribe';
import {
  authoriseVoiceScope,
  transcribeNote,
  loadNote,
  type VoiceScope,
} from '../../../lib/voice-access';
import type { VoiceNote } from '../../../types/diary';

export const prerender = false;

/**
 * POST /api/voice — multipart: audio (File), exactly one of entry_id /
 * quote_id / project_id, plus optional file_id and duration_s.
 *
 * Stores the recording, then transcribes it inline. Inline because the person
 * who just spoke is still looking at the screen: a transcript that appears a
 * minute later, in a queue, is one nobody checks while the memory is fresh.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }

  const audio = form.get('audio') as File | null;
  const entryId = (form.get('entry_id') as string | null) || null;
  const quoteId = (form.get('quote_id') as string | null) || null;
  const projectId = (form.get('project_id') as string | null) || null;
  const fileId = (form.get('file_id') as string | null) || null;
  const rawDuration = form.get('duration_s') as string | null;

  if (!audio) return Response.json({ error: 'No audio provided' }, { status: 400 });

  const scopes = [entryId, quoteId, projectId].filter(Boolean);
  if (scopes.length !== 1) {
    return Response.json(
      { error: 'Provide exactly one of entry_id, quote_id or project_id' },
      { status: 400 }
    );
  }

  const auth = await authoriseVoiceScope(env.DB, locals, { entry_id: entryId, quote_id: quoteId, project_id: projectId });
  if (!auth.ok) return auth.response;
  const { scope, scopeId, projectId: resolvedProject, orgId } = auth.resolved;

  // A file_id only ever narrows a note to one photo — it must be a photo on an
  // entry this user can already reach, or it becomes a way to attach commentary
  // to someone else's job.
  if (fileId) {
    const file = await queryOne<{ entry_id: string }>(
      env.DB, 'SELECT entry_id FROM entry_files WHERE id = ?', [fileId]
    );
    if (!file || !(await canAccessEntry(env.DB, locals, file.entry_id))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const validation = validateAudio(audio.type, audio.size);
  if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });

  const mimeType = normaliseAudioType(audio.type);
  // A note recorded offline already carries the id the UI optimistically showed.
  // Honouring it makes the retry idempotent: a background-sync event that fires
  // twice — which they do — produces one note, not two copies of the same
  // sentence sitting in the day's record.
  const clientId = (form.get('id') as string | null)?.trim() || null;
  if (clientId) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 });
    }
    const existing = await loadNote(env.DB, clientId);
    if (existing) {
      // Already stored on the first attempt. Return it rather than a conflict:
      // to the phone this *is* success, and an error would keep it queued.
      return Response.json(existing, { status: 201 });
    }
  }

  const r2Key = buildVoiceKey(scope, scopeId, audio.name || 'note.webm');
  const buffer = await audio.arrayBuffer();

  await uploadToR2(env.R2, r2Key, buffer, mimeType, {
    scope,
    scopeId,
    recordedBy: user.id,
  });

  const id = clientId ?? generateId();
  const duration = rawDuration !== null && rawDuration !== '' ? Number(rawDuration) : null;

  await execute(
    env.DB,
    `INSERT INTO voice_notes
       (id, org_id, project_id, entry_id, quote_id, file_id, r2_key, mime_type,
        size_bytes, duration_s, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id, orgId, resolvedProject, entryId, quoteId, fileId, r2Key, mimeType,
      audio.size, Number.isFinite(duration as number) ? duration : null, user.id, now(),
    ]
  );

  // Settles the row to transcribed or failed; either way the note exists and
  // the audio is safe, so the upload itself has succeeded.
  await transcribeNote(env, id, buffer);

  const note = await loadNote(env.DB, id);
  return Response.json(note, { status: 201 });
};

/**
 * GET /api/voice?entry_id= | ?quote_id= | ?project_id= | ?file_id=
 *
 * Oldest first: the notes are a running commentary on a day, and reading them
 * in the order they were spoken is the only order that makes sense.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const entryId = url.searchParams.get('entry_id');
  const quoteId = url.searchParams.get('quote_id');
  const projectId = url.searchParams.get('project_id');
  const fileId = url.searchParams.get('file_id');

  // When a file_id is asked for, that photo's own entry decides access — any
  // other scope the caller also passed is ignored rather than trusted, or a
  // reachable project id would unlock another org's photo notes.
  let scope: VoiceScope;
  if (fileId) {
    const file = await queryOne<{ entry_id: string }>(
      env.DB, 'SELECT entry_id FROM entry_files WHERE id = ?', [fileId]
    );
    if (!file) return Response.json({ error: 'Not found' }, { status: 404 });
    scope = { entry_id: file.entry_id };
  } else {
    scope = { entry_id: entryId, quote_id: quoteId, project_id: projectId };
  }

  const auth = await authoriseVoiceScope(env.DB, locals, scope);
  if (!auth.ok) return auth.response;

  let sql: string;
  let params: unknown[];
  if (fileId) {
    sql = 'SELECT * FROM voice_notes WHERE file_id = ? ORDER BY created_at ASC';
    params = [fileId];
  } else if (entryId) {
    sql = 'SELECT * FROM voice_notes WHERE entry_id = ? ORDER BY created_at ASC';
    params = [entryId];
  } else if (quoteId) {
    sql = 'SELECT * FROM voice_notes WHERE quote_id = ? ORDER BY created_at ASC';
    params = [quoteId];
  } else {
    sql = 'SELECT * FROM voice_notes WHERE project_id = ? ORDER BY created_at ASC';
    params = [projectId];
  }

  const notes = await queryAll<VoiceNote>(env.DB, sql, params);
  return Response.json({ notes });
};
