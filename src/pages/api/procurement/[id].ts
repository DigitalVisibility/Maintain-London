import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { isStaff, hasCap } from '../../../lib/capabilities';
import type { ProcurementItem } from './index';

export const prerender = false;

async function load(env: any, locals: App.Locals, id: string) {
  const item = await queryOne<ProcurementItem>(env.DB, 'SELECT * FROM procurement_items WHERE id = ?', [id]);
  if (!item) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };
  if (!isStaff(locals.role) || !hasCap(locals, 'edit_diary')) return { error: new Response('Forbidden', { status: 403 }) };
  if (!(await canAccessProject(env.DB, locals, item.project_id))) return { error: new Response('Forbidden', { status: 403 }) };
  return { item };
}

/** PATCH /api/procurement/:id  { item?, supplier?, required_by?, status?, notes?, client_visible? } */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const it = found.item;

  const b = await request.json().catch(() => ({})) as {
    item?: string; supplier?: string | null; required_by?: string | null;
    status?: string; notes?: string | null; client_visible?: boolean;
  };
  const status = ['to_order', 'ordered', 'delivered'].includes(b.status ?? '') ? b.status : it.status;

  await execute(
    env.DB,
    `UPDATE procurement_items SET item = ?, supplier = ?, required_by = ?, status = ?, notes = ?, client_visible = ?, updated_at = ? WHERE id = ?`,
    [
      b.item?.trim() || it.item,
      b.supplier === undefined ? it.supplier : b.supplier,
      b.required_by === undefined ? it.required_by : b.required_by,
      status,
      b.notes === undefined ? it.notes : b.notes,
      b.client_visible === undefined ? it.client_visible : (b.client_visible ? 1 : 0),
      now(), it.id,
    ]
  );
  return Response.json({ status: 'updated' });
};

/** DELETE /api/procurement/:id */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  await execute(env.DB, 'DELETE FROM procurement_items WHERE id = ?', [found.item.id]);
  return Response.json({ status: 'deleted' });
};
