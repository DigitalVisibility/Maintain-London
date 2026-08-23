import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { hasCap, isStaff } from '../../../lib/capabilities';

export const prerender = false;

/** GET /api/rota?project_id=… — the people rota'd onto a project, joined to the roster. */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role) || !locals.org) return new Response('Forbidden', { status: 403 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json([]);

  const rows = await queryAll(
    env.DB,
    `SELECT r.id, r.person_id, r.days, r.start_time, r.end_time,
            p.name, p.role AS person_role, p.company, p.default_days, p.default_start, p.default_end
       FROM project_rota r JOIN people p ON p.id = r.person_id
      WHERE r.project_id = ? AND r.org_id = ? AND p.active = 1
      ORDER BY p.name`,
    [projectId, locals.org.id]
  );
  return Response.json(rows);
};

/** POST /api/rota — assign a person to a project. Managers/owners only. */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; person_id?: string; days?: string; start_time?: string; end_time?: string;
  };
  const projectId = body.project_id;
  const personId = body.person_id;
  if (!projectId || !personId) return Response.json({ error: 'project_id and person_id are required' }, { status: 400 });

  const project = await queryOne<{ org_id: string }>(env.DB, 'SELECT org_id FROM projects WHERE id = ?', [projectId]);
  if (!project || project.org_id !== locals.org.id) return new Response('Not found', { status: 404 });

  const id = generateId();
  try {
    await execute(
      env.DB,
      `INSERT INTO project_rota (id, org_id, project_id, person_id, days, start_time, end_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, locals.org.id, projectId, personId, body.days ?? null, body.start_time ?? null, body.end_time ?? null, now()]
    );
  } catch {
    return Response.json({ error: 'Already assigned to this project' }, { status: 409 });
  }
  return Response.json({ id }, { status: 201 });
};
