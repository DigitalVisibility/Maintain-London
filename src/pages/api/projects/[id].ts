import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { geocodePostcode } from '../../../lib/geocode';
import { can } from '../../../lib/capabilities';
import { canAccessProject } from '../../../lib/access';
import type { Project } from '../../../types/diary';

export const prerender = false;

/** Load a project only if it belongs to the request's active org. */
async function loadOwnedProject(env: any, id: string | undefined, orgId: string | undefined) {
  if (!id || !orgId) return null;
  const project = await queryOne<Project>(env.DB, 'SELECT * FROM projects WHERE id = ?', [id]);
  if (!project || project.org_id !== orgId) return null;
  return project;
}

/** GET /api/projects/:id — get a single project the caller may see. */
export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  // Org membership is not access: a client belongs to the org but must be linked
  // to *this* project. Without this a client can read any project by guessing an
  // id — name, address, and the other client's email.
  if (!(await canAccessProject(env.DB, locals, params.id))) {
    return new Response('Not found', { status: 404 });
  }

  const project = await loadOwnedProject(env, params.id, locals.org?.id);
  if (!project) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify(project), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** PUT /api/projects/:id — update project */
export const PUT: APIRoute = async ({ params, locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const existing = await loadOwnedProject(env, params.id, locals.org?.id);
  if (!existing) return new Response('Not found', { status: 404 });

  const body = await request.json() as Partial<Project>;
  const timestamp = now();

  const newPostcode = body.postcode ?? existing.postcode;
  const postcodeChanged = !!body.postcode && body.postcode.trim() !== existing.postcode?.trim();

  // Re-geocode if the postcode changed, or if coordinates were never set.
  // Explicit lat/lng in the request body still win, if provided.
  let lat = body.lat ?? existing.lat ?? null;
  let lng = body.lng ?? existing.lng ?? null;
  if (body.lat == null && body.lng == null && (postcodeChanged || existing.lat == null || existing.lng == null)) {
    const geo = await geocodePostcode(newPostcode);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  // 'client' (every variation needs the client's sign-off) or 'tiered' (follow
  // the project's spend limits). Anything else falls back to the safe default.
  const requestedVA = (body as any).variation_approval;
  const variationApproval =
    requestedVA === 'tiered' ? 'tiered'
    : requestedVA === 'client' ? 'client'
    : (existing as any).variation_approval ?? 'client';

  await execute(
    env.DB,
    `UPDATE projects SET
       name = ?, address = ?, postcode = ?, lat = ?, lng = ?,
       client_name = ?, client_email = ?, status = ?, variation_approval = ?, updated_at = ?
     WHERE id = ?`,
    [
      body.name ?? existing.name,
      body.address ?? existing.address,
      newPostcode,
      lat,
      lng,
      body.client_name ?? existing.client_name ?? null,
      body.client_email ?? existing.client_email ?? null,
      body.status ?? existing.status,
      variationApproval,
      timestamp,
      params.id,
    ]
  );

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

/** DELETE /api/projects/:id — delete project */
export const DELETE: APIRoute = async ({ params, locals }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const existing = await loadOwnedProject(env, params.id, locals.org?.id);
  if (!existing) return new Response('Not found', { status: 404 });

  await execute(env.DB, 'DELETE FROM projects WHERE id = ?', [params.id]);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
