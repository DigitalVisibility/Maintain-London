import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { isStaff, hasCap } from '../../../lib/capabilities';

export const prerender = false;

export interface ProcurementItem {
  id: string; org_id: string | null; project_id: string;
  item: string; supplier: string | null; required_by: string | null;
  status: string; notes: string | null; sort_order: number; client_visible: number;
  created_at: string; updated_at: string;
}

/** GET /api/procurement?project_id= — internal by default; clients see only shared rows. */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) return new Response('Forbidden', { status: 403 });

  const rows = isStaff(locals.role)
    ? await queryAll<ProcurementItem>(env.DB, 'SELECT * FROM procurement_items WHERE project_id = ? ORDER BY sort_order, required_by', [projectId])
    : await queryAll<ProcurementItem>(env.DB, 'SELECT * FROM procurement_items WHERE project_id = ? AND client_visible = 1 ORDER BY sort_order, required_by', [projectId]);
  return Response.json(rows);
};

/** POST /api/procurement  { project_id, item, supplier?, required_by?, notes? } */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role) || !hasCap(locals, 'edit_diary')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; item?: string; supplier?: string; required_by?: string; notes?: string;
  };
  if (!body.project_id || !body.item?.trim()) return Response.json({ error: 'project_id and item required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, body.project_id))) return new Response('Forbidden', { status: 403 });

  const last = await queryOne<{ m: number | null }>(env.DB, 'SELECT MAX(sort_order) AS m FROM procurement_items WHERE project_id = ?', [body.project_id]);
  const id = generateId();
  const t = now();
  await execute(
    env.DB,
    `INSERT INTO procurement_items (id, org_id, project_id, item, supplier, required_by, status, notes, sort_order, client_visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'to_order', ?, ?, 0, ?, ?)`,
    [id, locals.org.id, body.project_id, body.item.trim(), body.supplier ?? null, body.required_by ?? null, body.notes ?? null, (last?.m ?? 0) + 1, t, t]
  );
  return Response.json(await queryOne(env.DB, 'SELECT * FROM procurement_items WHERE id = ?', [id]), { status: 201 });
};
