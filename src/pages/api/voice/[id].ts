import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { getFromR2, deleteFromR2 } from '../../../lib/r2';
import { authoriseVoiceScope, transcribeNote } from '../../../lib/voice-access';
import type { VoiceNote } from '../../../types/diary';

export const prerender = false;

/**
 * Load the note, then authorise from the note's *own* scope.
 *
 * The order matters. Authorising from an entry_id or project_id the caller
 * handed us would only ever prove they can reach that scope — not that the
 * note belongs to it. That is exactly the mistake that once let a client of one
 * business read another's records, so the row speaks for itself here.
 */
async function load(
  env: App.Locals['runtime']['env'],
  locals: App.Locals,
  id: string
): Promise<{ note: VoiceNote } | { error: Response }> {
  if (!id) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };

  const note = await queryOne<VoiceNote>(env.DB, 'SELECT * FROM voice_notes WHERE id = ?', [id]);
  if (!note) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };

  const auth = await authoriseVoiceScope(env.DB, locals, {
    entry_id: note.entry_id ?? null,
    quote_id: note.quote_id ?? null,
    project_id: note.project_id ?? null,
  });
  if (!auth.ok) return { error: auth.response };

  return { note };
}

/** GET /api/voice/:id */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  return Response.json(found.note);
};

/**
 * PATCH /api/voice/:id  { action: 'retry' }
 *
 * Re-runs Whisper over the audio still sitting in R2. Keeping the recording is
 * what makes this possible: a note that failed because the binding was cold or
 * the model hiccuped is one click from being readable, with no need to go back
 * to site and say it all again.
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const { note } = found;

  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action !== 'retry') {
    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  }

  const object = await getFromR2(env.R2, note.r2_key);
  if (!object) {
    // The audio is gone, so no retry can ever succeed — say so on the row
    // rather than leaving it looking retryable for ever.
    await execute(
      env.DB,
      `UPDATE voice_notes SET status = 'failed', error = ? WHERE id = ?`,
      ['Recording is no longer in storage', note.id]
    );
    return Response.json({ error: 'Recording is no longer in storage' }, { status: 404 });
  }

  await execute(
    env.DB,
    `UPDATE voice_notes SET status = 'pending', error = NULL WHERE id = ?`,
    [note.id]
  );

  await transcribeNote(env, note.id, await object.arrayBuffer());

  const updated = await queryOne<VoiceNote>(env.DB, 'SELECT * FROM voice_notes WHERE id = ?', [note.id]);
  return Response.json(updated);
};

/**
 * DELETE /api/voice/:id — the audio goes first, then the row.
 *
 * That order because the row is the only record of the key: dropping it first
 * would strand the recording in the bucket with nothing left pointing at it.
 */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const { note } = found;

  await deleteFromR2(env.R2, note.r2_key);
  await execute(env.DB, 'DELETE FROM voice_notes WHERE id = ?', [note.id]);

  return Response.json({ status: 'deleted' });
};
