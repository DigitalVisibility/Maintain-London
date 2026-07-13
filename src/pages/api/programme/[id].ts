import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { isStaff, hasCap } from '../../../lib/capabilities';
import type { ProgrammeTask } from './index';

export const prerender = false;

async function load(env: any, locals: App.Locals, id: string) {
  const task = await queryOne<ProgrammeTask>(env.DB, 'SELECT * FROM programme_tasks WHERE id = ?', [id]);
  if (!task) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };
  if (!isStaff(locals.role) || !hasCap(locals, 'edit_diary')) return { error: new Response('Forbidden', { status: 403 }) };
  if (!(await canAccessProject(env.DB, locals, task.project_id))) return { error: new Response('Forbidden', { status: 403 }) };
  return { task };
}

/** PATCH /api/programme/:id  { name?, start_date?, end_date?, status?, client_visible? } */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const t = found.task;

  const b = await request.json().catch(() => ({})) as {
    name?: string; start_date?: string | null; end_date?: string | null;
    status?: string; client_visible?: boolean;
  };
  const status = ['not_started', 'in_progress', 'complete'].includes(b.status ?? '') ? b.status : t.status;

  await execute(
    env.DB,
    `UPDATE programme_tasks SET name = ?, start_date = ?, end_date = ?, status = ?, client_visible = ?, updated_at = ? WHERE id = ?`,
    [
      b.name?.trim() || t.name,
      b.start_date === undefined ? t.start_date : b.start_date,
      b.end_date === undefined ? t.end_date : b.end_date,
      status,
      b.client_visible === undefined ? t.client_visible : (b.client_visible ? 1 : 0),
      now(), t.id,
    ]
  );
  return Response.json({ status: 'updated' });
};

/** DELETE /api/programme/:id */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  await execute(env.DB, 'DELETE FROM programme_tasks WHERE id = ?', [found.task.id]);
  return Response.json({ status: 'deleted' });
};
