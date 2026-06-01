import type { APIRoute } from 'astro';
import { queryAll, execute, generateId, now } from '../../../lib/db';
import { geocodePostcode } from '../../../lib/geocode';
import { can } from '../../../lib/capabilities';
import type { Project } from '../../../types/diary';

export const prerender = false;

/** GET /api/projects — list projects in the active organisation */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const orgId = locals.org?.id;
  if (!orgId) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const projects = await queryAll<Project>(
    env.DB,
    'SELECT * FROM projects WHERE org_id = ? ORDER BY updated_at DESC',
    [orgId]
  );

  return new Response(JSON.stringify(projects), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** POST /api/projects — create a new project in the active organisation */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const orgId = locals.org?.id;
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'No active organisation' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json() as Partial<Project>;
  if (!body.name || !body.address || !body.postcode) {
    return new Response(JSON.stringify({ error: 'Name, address and postcode are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = generateId();
  const timestamp = now();

  // Auto-geocode the postcode so weather can auto-populate. If the lookup
  // fails (bad postcode / service down) we store nulls and carry on.
  const geo = await geocodePostcode(body.postcode);

  await execute(
    env.DB,
    `INSERT INTO projects (id, org_id, name, address, postcode, lat, lng, client_name, client_email, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      orgId,
      body.name,
      body.address,
      body.postcode,
      body.lat ?? geo?.lat ?? null,
      body.lng ?? geo?.lng ?? null,
      body.client_name ?? null,
      body.client_email ?? null,
      body.status ?? 'active',
      user.id,
      timestamp,
      timestamp,
    ]
  );

  return new Response(JSON.stringify({ id, ...body, created_at: timestamp }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
