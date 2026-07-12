import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap, isStaff } from '../../../lib/capabilities';

export const prerender = false;

export interface Milestone {
  id: string;
  org_id: string | null;
  project_id: string;
  name: string;
  sort_order: number;
  target_date: string | null;
  status: 'pending' | 'complete';
  completed_at: string | null;
  completed_by: string | null;
  triggers_summary: number;
  created_at: string;
}

/** GET /api/milestones?project_id= */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role)) return new Response('Forbidden', { status: 403 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const rows = await queryAll<Milestone>(
    env.DB,
    'SELECT * FROM project_milestones WHERE project_id = ? ORDER BY sort_order, created_at',
    [projectId]
  );
  return Response.json(rows);
};

/** POST /api/milestones  { project_id, name, target_date?, triggers_summary? } */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; name?: string; target_date?: string; triggers_summary?: boolean;
  };

  if (!body.project_id || !body.name?.trim()) {
    return Response.json({ error: 'project_id and name required' }, { status: 400 });
  }
  if (!hasCap(locals, 'manage_projects') || !(await canAccessProject(env.DB, locals, body.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const last = await queryOne<{ max_order: number | null }>(
    env.DB,
    'SELECT MAX(sort_order) AS max_order FROM project_milestones WHERE project_id = ?',
    [body.project_id]
  );

  const id = generateId();
  await execute(
    env.DB,
    `INSERT INTO project_milestones
       (id, org_id, project_id, name, sort_order, target_date, status, triggers_summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id, locals.org.id, body.project_id, body.name.trim(),
      (last?.max_order ?? 0) + 1, body.target_date ?? null,
      body.triggers_summary === false ? 0 : 1, now(),
    ]
  );

  const created = await queryOne<Milestone>(env.DB, 'SELECT * FROM project_milestones WHERE id = ?', [id]);
  return Response.json(created, { status: 201 });
};
