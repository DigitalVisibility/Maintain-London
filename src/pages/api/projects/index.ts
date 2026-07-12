import type { APIRoute } from 'astro';
import { queryAll, execute, generateId, now } from '../../../lib/db';
import { geocodePostcode } from '../../../lib/geocode';
import { can, isStaff } from '../../../lib/capabilities';
import type { Project } from '../../../types/diary';

export const prerender = false;

/** GET /api/projects — projects the caller may see in the active organisation */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const orgId = locals.org?.id;
  if (!orgId) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  // Staff see the whole org. A client is a *member* of the org, so an org-only
  // filter would hand them every other client's project — names, addresses and
  // client emails included. A client sees only the projects they're linked to.
  const projects = isStaff(locals.role)
    ? await queryAll<Project>(
        env.DB,
        'SELECT * FROM projects WHERE org_id = ? ORDER BY updated_at DESC',
        [orgId]
      )
    : await queryAll<Project>(
        env.DB,
        `SELECT p.* FROM projects p
           JOIN project_clients pc ON pc.project_id = p.id
          WHERE p.org_id = ? AND pc.user_id = ?
          ORDER BY p.updated_at DESC`,
        [orgId, user.id]
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
