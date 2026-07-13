import type { APIRoute } from 'astro';
import { getFromR2, deleteFromR2 } from '../../../lib/r2';
import { execute } from '../../../lib/db';
import { loadDocByKey, canReadDoc, canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';

export const prerender = false;

/** R2 keys contain slashes; callers percent-encode them and Astro doesn't decode
 *  %2F in a rest param, so decode before looking the key up (same as photos). */
function decodeKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return null; }
}

/** GET /api/documents/{key} — serve a document file. */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const key = decodeKey(params.key);
  if (!key) return new Response('Key is required', { status: 400 });

  const doc = await loadDocByKey(env.DB, key);
  if (!doc) return new Response('File not found', { status: 404 });
  if (!(await canReadDoc(env.DB, locals, doc))) return new Response('Forbidden', { status: 403 });

  const object = await getFromR2(env.R2, key);
  if (!object) return new Response('File not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=3600');
  if (object.size) headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
};

/** PATCH /api/documents/{key} — toggle client visibility. */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const key = decodeKey(params.key);
  if (!key) return Response.json({ error: 'Key is required' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { client_visible?: boolean | number };
  if (body.client_visible === undefined) {
    return Response.json({ error: 'client_visible is required' }, { status: 400 });
  }

  const doc = await loadDocByKey(env.DB, key);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessProject(env.DB, locals, doc.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Choosing what the client sees is a release action.
  if (!hasCap(locals, 'release_to_client')) {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  await execute(env.DB, 'UPDATE documents SET client_visible = ? WHERE r2_key = ?', [body.client_visible ? 1 : 0, key]);
  return Response.json({ status: 'updated', client_visible: body.client_visible ? 1 : 0 });
};

/** DELETE /api/documents/{key} — remove a document. */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  // Deleting a project document is a managers-and-up action.
  if (locals.role === 'client' || locals.role === 'operative') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const key = decodeKey(params.key);
  if (!key) return Response.json({ error: 'Key is required' }, { status: 400 });

  const doc = await loadDocByKey(env.DB, key);
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessProject(env.DB, locals, doc.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deleteFromR2(env.R2, key);
  await execute(env.DB, 'DELETE FROM documents WHERE r2_key = ?', [key]);
  return Response.json({ status: 'deleted' });
};
