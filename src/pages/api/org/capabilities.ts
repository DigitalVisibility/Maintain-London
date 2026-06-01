import type { APIRoute } from 'astro';
import { queryAll, execute } from '../../../lib/db';
import { can, ROLE_CAPABILITIES, ALL_CAPABILITIES } from '../../../lib/capabilities';

export const prerender = false;

/** GET /api/org/capabilities — defaults + this org's overrides (for the toggles UI) */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const overrides = await queryAll(
    env.DB,
    'SELECT role, capability, enabled FROM role_capabilities WHERE org_id = ?',
    [locals.org?.id ?? '']
  );
  return Response.json({ defaults: ROLE_CAPABILITIES, all: ALL_CAPABILITIES, overrides });
};

/** PUT /api/org/capabilities  { role, capability, enabled } — set/override one toggle */
export const PUT: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json({ error: 'No active organisation' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { role?: string; capability?: string; enabled?: boolean };
  if (!body.role || !body.capability) return Response.json({ error: 'role and capability required' }, { status: 400 });
  // Owners/admins always have everything — don't allow locking them out.
  if (body.role === 'owner' || body.role === 'admin') {
    return Response.json({ error: 'Owner/admin capabilities are fixed' }, { status: 400 });
  }

  await execute(
    env.DB,
    `INSERT INTO role_capabilities (org_id, role, capability, enabled) VALUES (?, ?, ?, ?)
     ON CONFLICT(org_id, role, capability) DO UPDATE SET enabled = excluded.enabled`,
    [orgId, body.role, body.capability, body.enabled ? 1 : 0]
  );
  return Response.json({ success: true });
};
