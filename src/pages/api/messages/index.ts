import type { APIRoute } from 'astro';
import { queryAll, execute, generateId, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';

export const prerender = false;

/** GET /api/messages?project_id= — list a project's message thread */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) return new Response('Forbidden', { status: 403 });

  const messages = await queryAll(
    env.DB,
    'SELECT id, user_id, author_name, author_role, body, created_at FROM messages WHERE project_id = ? ORDER BY created_at',
    [projectId]
  );
  return Response.json(messages);
};

/** POST /api/messages  { project_id, body } */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({})) as { project_id?: string; body?: string };
  if (!body.project_id || !body.body?.trim()) {
    return Response.json({ error: 'project_id and body required' }, { status: 400 });
  }
  if (!(await canAccessProject(env.DB, locals, body.project_id))) return new Response('Forbidden', { status: 403 });

  const id = generateId();
  await execute(
    env.DB,
    `INSERT INTO messages (id, org_id, project_id, user_id, author_name, author_role, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, locals.org?.id ?? null, body.project_id, user.id, user.name ?? null, locals.role ?? null, body.body.trim(), now()]
  );
  return Response.json({ id, success: true }, { status: 201 });
};
