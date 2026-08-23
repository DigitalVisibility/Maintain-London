import type { APIRoute } from 'astro';
import { queryOne } from '../../../../lib/db';
import { getFromR2 } from '../../../../lib/r2';
import { authoriseVoiceScope } from '../../../../lib/voice-access';
import type { VoiceNote } from '../../../../types/diary';

export const prerender = false;

/**
 * GET /api/voice/{id}/audio — stream the recording back.
 *
 * Separate from GET /api/voice/{id}, which returns the row as JSON: an <audio>
 * element needs bytes and a content type, not a record. Kept as its own route
 * rather than content-negotiated on the same URL, because a player that gets
 * JSON fails silently and looks like a broken recording.
 *
 * The R2 key is resolved through D1 first, so only keys we issued can ever be
 * served — the same guarantee lib/access.ts documents for entry files. The
 * caller's claim about which note this is never reaches the bucket.
 */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const id = params.id;
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  const note = await queryOne<VoiceNote>(
    env.DB,
    'SELECT * FROM voice_notes WHERE id = ?',
    [id]
  );
  if (!note) return Response.json({ error: 'Not found' }, { status: 404 });

  // Authorise from the stored row's own scope, never from a query parameter.
  const auth = await authoriseVoiceScope(env.DB, locals, {
    entry_id: note.entry_id,
    quote_id: note.quote_id,
    project_id: note.project_id,
  });
  if (!auth.ok) return auth.response;

  const object = await getFromR2(env.R2, note.r2_key);
  if (!object) {
    // The row outlived its audio. Say so plainly rather than returning an empty
    // 200 that a player renders as a zero-length recording.
    return Response.json({ error: 'Recording is no longer stored' }, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': note.mime_type || 'audio/webm',
      'Content-Length': String(object.size),
      // Private: this is one business's site record, and a shared cache must
      // never hold it. Re-fetching costs nothing worth protecting.
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
};
