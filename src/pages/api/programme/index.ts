import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { isStaff, hasCap } from '../../../lib/capabilities';

export const prerender = false;

export interface ProgrammeTask {
  id: string; org_id: string | null; project_id: string;
  name: string; start_date: string | null; end_date: string | null;
  status: string; sort_order: number; client_visible: number;
  created_at: string; updated_at: string;
}

/** GET /api/programme?project_id= — the task list (client: visible tasks only). */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) return new Response('Forbidden', { status: 403 });

  const rows = isStaff(locals.role)
    ? await queryAll<ProgrammeTask>(env.DB, 'SELECT * FROM programme_tasks WHERE project_id = ? ORDER BY sort_order, start_date', [projectId])
    : await queryAll<ProgrammeTask>(env.DB, 'SELECT * FROM programme_tasks WHERE project_id = ? AND client_visible = 1 ORDER BY sort_order, start_date', [projectId]);
  return Response.json(rows);
};

/** POST /api/programme  { project_id, name, start_date?, end_date? } */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role) || !hasCap(locals, 'edit_diary')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; name?: string; start_date?: string; end_date?: string;
  };
  if (!body.project_id || !body.name?.trim()) return Response.json({ error: 'project_id and name required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, body.project_id))) return new Response('Forbidden', { status: 403 });

  const last = await queryOne<{ m: number | null }>(env.DB, 'SELECT MAX(sort_order) AS m FROM programme_tasks WHERE project_id = ?', [body.project_id]);
  const id = generateId();
  const t = now();
  await execute(
    env.DB,
    `INSERT INTO programme_tasks (id, org_id, project_id, name, start_date, end_date, status, sort_order, client_visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, 1, ?, ?)`,
    [id, locals.org.id, body.project_id, body.name.trim(), body.start_date ?? null, body.end_date ?? null, (last?.m ?? 0) + 1, t, t]
  );
  return Response.json(await queryOne(env.DB, 'SELECT * FROM programme_tasks WHERE id = ?', [id]), { status: 201 });
};
