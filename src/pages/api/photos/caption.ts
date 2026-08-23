import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { getFromR2 } from '../../../lib/r2';
import { canAccessEntry } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { captionPhoto, canCaption } from '../../../lib/vision';

export const prerender = false;

/** How many photos one request may caption. A phone burst is long; the wall clock isn't. */
const MAX_BATCH = 20;

type Status = 'done' | 'failed' | 'skipped';

interface CaptionOutcome {
  id: string;
  ai_caption?: string;
  ai_tags?: string[];
  ai_status: Status;
  /** Why it failed, or why it was skipped. Never why it was omitted. */
  error?: string;
}

/** The file plus the project context the caption is written against. */
interface PhotoRow {
  id: string;
  entry_id: string;
  r2_key: string;
  mime_type: string;
  taken_at: string | null;
  entry_date: string | null;
  project_name: string | null;
}

/**
 * POST /api/photos/caption
 *
 * Body: { file_ids: string[] }  (max 20)
 *
 * Captioning is deliberately *not* done inline on upload — uploads happen in
 * bursts on a phone on site and must stay fast. The client fires this once the
 * files are safely stored, and can fire it again for anything still pending.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  // A client is outside the business: they see vetted, released content and
  // never spend the business's AI budget or put words in the diary.
  if (locals.role === 'client' || !hasCap(locals, 'edit_diary')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI captioning is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { file_ids?: unknown } | null;
  const raw: unknown[] = Array.isArray(body?.file_ids) ? (body.file_ids as unknown[]) : [];
  const ids = raw.filter((id): id is string => typeof id === 'string' && id !== '');

  if (ids.length === 0) {
    return Response.json({ error: 'file_ids is required' }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return Response.json({ error: `At most ${MAX_BATCH} files per request` }, { status: 400 });
  }

  const results: CaptionOutcome[] = [];

  for (const id of new Set(ids)) {
    const row = await queryOne<PhotoRow>(
      env.DB,
      `SELECT f.id, f.entry_id, f.r2_key, f.mime_type, f.taken_at,
              e.date AS entry_date, p.name AS project_name
       FROM entry_files f
       JOIN diary_entries e ON e.id = f.entry_id
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE f.id = ?`,
      [id]
    );

    // A file this user may not touch is simply absent from the results — the
    // same answer as an id that never existed, so probing ids tells you nothing
    // about another business's data.
    if (!row) continue;
    if (!(await canAccessEntry(env.DB, locals, row.entry_id))) continue;

    if (!canCaption(row.mime_type)) {
      // HEIC and PDFs are legitimate uploads here; they just aren't vision
      // inputs. Skipping leaves ai_status untouched rather than marking a
      // perfectly good delivery note as failed.
      results.push({
        id: row.id,
        ai_status: 'skipped',
        error: `${row.mime_type} cannot be captioned`,
      });
      continue;
    }

    try {
      const object = await getFromR2(env.R2, row.r2_key);
      if (!object) throw new Error('File is missing from storage');

      const result = await captionPhoto(
        env.ANTHROPIC_API_KEY,
        { data: await object.arrayBuffer(), mimeType: row.mime_type },
        {
          project: row.project_name ?? undefined,
          date: row.taken_at ?? row.entry_date ?? undefined,
        }
      );

      await execute(
        env.DB,
        `UPDATE entry_files SET ai_caption = ?, ai_tags = ?, ai_status = 'done' WHERE id = ?`,
        [result.caption, JSON.stringify(result.tags), row.id]
      );

      results.push({
        id: row.id,
        ai_caption: result.caption,
        ai_tags: result.tags,
        ai_status: 'done',
      });
    } catch (err) {
      // One unreadable photo must not cost the other nineteen their captions.
      // The row is marked failed so the UI can offer a retry rather than
      // leaving it stuck on 'pending' forever.
      await execute(
        env.DB,
        `UPDATE entry_files SET ai_status = 'failed' WHERE id = ?`,
        [row.id]
      ).catch(() => { /* the caption already failed; don't lose the batch to a write error too */ });

      results.push({
        id: row.id,
        ai_status: 'failed',
        error: err instanceof Error ? err.message : 'Captioning failed',
      });
    }
  }

  return Response.json({ results });
};
