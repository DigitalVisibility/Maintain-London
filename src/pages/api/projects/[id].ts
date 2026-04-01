import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';
import { queryOne, execute, now } from '../../../lib/db';
import type { Project } from '../../../types/diary';

export const prerender = false;

/** GET /api/projects/:id — get single project */
export const GET: APIRoute = async ({ params, locals, request }) => {
  const { env } = locals.runtime;
  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const project = await queryOne<Project>(
    env.DB,
    'SELECT * FROM projects WHERE id = ?',
    [params.id]
  );

  if (!project) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify(project), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** PUT /api/projects/:id — update project (admin only) */
export const PUT: APIRoute = async ({ params, locals, request }) => {
  const { env } = locals.runtime;
  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const existing = await queryOne<Project>(
    env.DB,
    'SELECT * FROM projects WHERE id = ?',
    [params.id]
  );
  if (!existing) return new Response('Not found', { status: 404 });

  const body = await request.json() as Partial<Project>;
  const timestamp = now();

  await execute(
    env.DB,
    `UPDATE projects SET
       name = ?, address = ?, postcode = ?, lat = ?, lng = ?,
       client_name = ?, client_email = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    [
      body.name ?? existing.name,
      body.address ?? existing.address,
      body.postcode ?? existing.postcode,
      body.lat ?? existing.lat ?? null,
      body.lng ?? existing.lng ?? null,
      body.client_name ?? existing.client_name ?? null,
      body.client_email ?? existing.client_email ?? null,
      body.status ?? existing.status,
      timestamp,
      params.id,
    ]
  );

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** DELETE /api/projects/:id — delete project (admin only) */
export const DELETE: APIRoute = async ({ params, locals, request }) => {
  const { env } = locals.runtime;
  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });

  await execute(env.DB, 'DELETE FROM projects WHERE id = ?', [params.id]);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
