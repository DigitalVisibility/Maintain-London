import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { isStaff, hasCap } from '../../../lib/capabilities';
import { normaliseFolder, type DocumentFolder } from '../../../lib/documents';

export const prerender = false;

async function load(env: any, locals: App.Locals, id: string) {
  const folder = await queryOne<DocumentFolder>(env.DB, 'SELECT * FROM document_folders WHERE id = ?', [id]);
  if (!folder) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };
  // A folder belongs to a business; only that business's staff may manage it.
  if (folder.org_id !== locals.org?.id) return { error: new Response('Forbidden', { status: 403 }) };
  if (!isStaff(locals.role) || !hasCap(locals, 'manage_projects')) return { error: new Response('Forbidden', { status: 403 }) };
  return { folder };
}

/** PATCH /api/document-folders/:id  { name?, client_default? } — rename / set default visibility. */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const f = found.folder;

  const b = await request.json().catch(() => ({})) as { name?: string; client_default?: boolean };
  const newName = b.name !== undefined ? normaliseFolder(b.name) : f.name;

  if (newName !== f.name) {
    const clash = await queryOne(
      env.DB, 'SELECT 1 AS ok FROM document_folders WHERE org_id = ? AND name = ? AND id != ?',
      [f.org_id, newName, f.id]
    );
    if (clash) return Response.json({ error: 'A folder with that name already exists' }, { status: 409 });
    // Move the folder's existing files to the new name so nothing is orphaned.
    await execute(env.DB, 'UPDATE documents SET folder = ? WHERE org_id = ? AND folder = ?', [newName, f.org_id, f.name]);
  }

  await execute(
    env.DB,
    'UPDATE document_folders SET name = ?, client_default = ? WHERE id = ?',
    [newName, b.client_default === undefined ? f.client_default : (b.client_default ? 1 : 0), f.id]
  );
  return Response.json({ status: 'updated' });
};

/** DELETE /api/document-folders/:id — remove an empty folder. */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const f = found.folder;

  // Don't silently orphan files — a folder must be emptied before it's removed.
  const inUse = await queryOne<{ n: number }>(
    env.DB, 'SELECT COUNT(*) AS n FROM documents WHERE org_id = ? AND folder = ?', [f.org_id, f.name]
  );
  if ((inUse?.n ?? 0) > 0) {
    return Response.json({ error: "This folder isn't empty. Delete or move its files first." }, { status: 409 });
  }

  await execute(env.DB, 'DELETE FROM document_folders WHERE id = ?', [f.id]);
  return Response.json({ status: 'deleted' });
};
