import type { APIRoute } from 'astro';
import { getFromR2, deleteFromR2 } from '../../../lib/r2';
import { execute } from '../../../lib/db';

export const prerender = false;

/** GET /api/photos/{r2Key} — serve a file from R2 */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const key = params.key;
  if (!key) return new Response('Key is required', { status: 400 });

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

/** DELETE /api/photos/{r2Key} — delete a file from R2 and D1 */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Only admins and managers can delete files
  if (user.role === 'operative') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const key = params.key;
  if (!key) return Response.json({ error: 'Key is required' }, { status: 400 });

  // Delete from R2
  await deleteFromR2(env.R2, key);

  // Delete metadata from D1
  await execute(env.DB, 'DELETE FROM entry_files WHERE r2_key = ?', [key]);

  return Response.json({ status: 'deleted' });
};
