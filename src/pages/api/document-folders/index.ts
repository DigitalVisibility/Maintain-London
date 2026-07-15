import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { isStaff, hasCap } from '../../../lib/capabilities';
import { DEFAULT_FOLDERS, normaliseFolder, type DocumentFolder } from '../../../lib/documents';

export const prerender = false;

/** Ensure a business has its folders, seeding the standard set the first time. */
async function ensureFolders(env: any, orgId: string): Promise<DocumentFolder[]> {
  const existing = await queryAll<DocumentFolder>(
    env.DB, 'SELECT * FROM document_folders WHERE org_id = ? ORDER BY sort_order, name', [orgId]
  );
  if (existing.length > 0) return existing;

  const t = now();
  for (let i = 0; i < DEFAULT_FOLDERS.length; i++) {
    const f = DEFAULT_FOLDERS[i];
    await execute(
      env.DB,
      'INSERT OR IGNORE INTO document_folders (id, org_id, name, sort_order, client_default, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [generateId(), orgId, f.name, i, f.client_default, t]
    );
  }
  return queryAll<DocumentFolder>(
    env.DB, 'SELECT * FROM document_folders WHERE org_id = ? ORDER BY sort_order, name', [orgId]
  );
}

/** GET /api/document-folders — the business's folders (seeded with defaults if new). */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });

  // Only staff manage folders; a client's folder view is derived from the files
  // shared with them, so they never need this.
  if (!isStaff(locals.role)) return Response.json([]);

  return Response.json(await ensureFolders(env, locals.org.id));
};

/** POST /api/document-folders  { name, client_default? } — add a folder. */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role) || !hasCap(locals, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as { name?: string; client_default?: boolean };
  if (!body.name?.trim()) {
    return Response.json({ error: 'A folder name is required' }, { status: 400 });
  }
  const name = normaliseFolder(body.name);

  const clash = await queryOne(
    env.DB, 'SELECT 1 AS ok FROM document_folders WHERE org_id = ? AND name = ?', [locals.org.id, name]
  );
  if (clash) return Response.json({ error: 'A folder with that name already exists' }, { status: 409 });

  const last = await queryOne<{ m: number | null }>(
    env.DB, 'SELECT MAX(sort_order) AS m FROM document_folders WHERE org_id = ?', [locals.org.id]
  );
  const id = generateId();
  await execute(
    env.DB,
    'INSERT INTO document_folders (id, org_id, name, sort_order, client_default, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, locals.org.id, name, (last?.m ?? 0) + 1, body.client_default ? 1 : 0, now()]
  );
  return Response.json(await queryOne(env.DB, 'SELECT * FROM document_folders WHERE id = ?', [id]), { status: 201 });
};
