import type { APIRoute } from 'astro';
import { getFromR2, deleteFromR2 } from '../../../lib/r2';
import { execute } from '../../../lib/db';
import { loadFileByKey, canReadFile, canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';

export const prerender = false;

/**
 * R2 keys contain slashes (entries/{entryId}/{fileType}/{file}), so callers
 * percent-encode them into a single path segment. Astro's rest param does not
 * decode %2F, so the key arrives here still encoded and has to be decoded before
 * it will match anything in the bucket — without this every photo 404s.
 *
 * Decoding an already-decoded key is a no-op: buildR2Key() sanitises filenames
 * to [A-Za-z0-9._-], so a real key never contains a literal '%'.
 */
function decodeKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null; // malformed escape sequence
  }
}

/** GET /api/photos/{r2Key} — serve a file from R2 */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const key = decodeKey(params.key);
  if (!key) return new Response('Key is required', { status: 400 });

  const file = await loadFileByKey(env.DB, key);
  if (!file) return new Response('File not found', { status: 404 });
  if (!(await canReadFile(env.DB, locals, file))) return new Response('Forbidden', { status: 403 });

  const object = await getFromR2(env.R2, key);
  if (!object) return new Response('File not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=3600');

  if (object.size) {
    headers.set('Content-Length', String(object.size));
  }

  return new Response(object.body, { headers });
};

/** PATCH /api/photos/{r2Key} — update file metadata (currently client visibility) */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const key = decodeKey(params.key);
  if (!key) return Response.json({ error: 'Key is required' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { client_visible?: boolean | number };
  if (body.client_visible === undefined) {
    return Response.json({ error: 'client_visible is required' }, { status: 400 });
  }

  const file = await loadFileByKey(env.DB, key);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });
  if (!(await canAccessProject(env.DB, locals, file.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Marking a photo client-visible *is* releasing it to the client.
  if (!hasCap(locals, 'release_to_client')) {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  await execute(
    env.DB,
    'UPDATE entry_files SET client_visible = ? WHERE r2_key = ?',
    [body.client_visible ? 1 : 0, key]
  );

  return Response.json({ status: 'updated', client_visible: body.client_visible ? 1 : 0 });
};

/** DELETE /api/photos/{r2Key} — delete a file from R2 and D1 */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  // Removing site evidence is destructive: operatives may add files but not
  // delete them, and a client never can.
  if (locals.role === 'client' || locals.role === 'operative') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const key = decodeKey(params.key);
  if (!key) return Response.json({ error: 'Key is required' }, { status: 400 });

  const file = await loadFileByKey(env.DB, key);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });
  if (!(await canAccessProject(env.DB, locals, file.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deleteFromR2(env.R2, key);
  await execute(env.DB, 'DELETE FROM entry_files WHERE r2_key = ?', [key]);

  return Response.json({ status: 'deleted' });
};
