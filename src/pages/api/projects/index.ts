import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';
import { queryAll, execute, generateId, now } from '../../../lib/db';
import type { Project } from '../../../types/diary';

export const prerender = false;

/** GET /api/projects — list all projects */
export const GET: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const projects = await queryAll<Project>(
    env.DB,
    'SELECT * FROM projects ORDER BY updated_at DESC'
  );

  return new Response(JSON.stringify(projects), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** POST /api/projects — create a new project (admin only) */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const body = await request.json() as Partial<Project>;
  if (!body.name || !body.address || !body.postcode) {
    return new Response(JSON.stringify({ error: 'Name, address and postcode are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = generateId();
  const timestamp = now();

  await execute(
    env.DB,
    `INSERT INTO projects (id, name, address, postcode, lat, lng, client_name, client_email, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      body.name,
      body.address,
      body.postcode,
      body.lat ?? null,
      body.lng ?? null,
      body.client_name ?? null,
      body.client_email ?? null,
      body.status ?? 'active',
      session.user.id,
      timestamp,
      timestamp,
    ]
  );

  return new Response(JSON.stringify({ id, ...body, created_at: timestamp }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
