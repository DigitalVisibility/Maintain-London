import type { APIRoute } from 'astro';
import { queryOne, execute, generateId, now } from '../../../lib/db';
import { can, type Role } from '../../../lib/capabilities';

export const prerender = false;

const VALID_ROLES: Role[] = ['owner', 'admin', 'manager', 'operative', 'client'];

/**
 * PATCH /api/members/:userId
 *   { role }              — change a member's role
 *   { sees_financials }   — grant/remove this person's access to the money
 *                           (view_costs: quotes, invoices, variations, valuation)
 * Either or both. Only owners/admins (manage_users) can call it.
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json({ error: 'No active organisation' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { role?: string; sees_financials?: boolean };

  // The target must actually belong to this business — never touch a user who
  // only belongs to another org.
  const member = await queryOne<{ user_id: string }>(
    env.DB, 'SELECT user_id FROM memberships WHERE user_id = ? AND org_id = ?', [params.userId, orgId]
  );
  if (!member) return Response.json({ error: 'Not a member of this business' }, { status: 404 });

  if (body.role !== undefined) {
    const role = body.role as Role;
    if (!VALID_ROLES.includes(role)) return Response.json({ error: 'Invalid role' }, { status: 400 });
    await execute(env.DB, 'UPDATE memberships SET role = ? WHERE user_id = ? AND org_id = ?', [role, params.userId, orgId]);
    // Keep the user's primary role in sync (fallback only), guarded to this org.
    await execute(
      env.DB,
      `UPDATE user SET role = ? WHERE id = ? AND EXISTS (SELECT 1 FROM memberships WHERE user_id = ? AND org_id = ?)`,
      [role, params.userId, params.userId, orgId]
    );
  }

  if (body.sees_financials !== undefined) {
    // A per-user grant of view_costs. Upsert so it's the one source for this person.
    await execute(
      env.DB,
      `INSERT INTO user_capabilities (id, org_id, user_id, capability, enabled, created_at)
       VALUES (?, ?, ?, 'view_costs', ?, ?)
       ON CONFLICT (org_id, user_id, capability) DO UPDATE SET enabled = excluded.enabled`,
      [generateId(), orgId, params.userId, body.sees_financials ? 1 : 0, now()]
    );
  }

  return Response.json({ success: true });
};

/** DELETE /api/members/:userId — remove someone from the active org */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });
  if (params.userId === locals.user.id) {
    return Response.json({ error: "You can't remove yourself." }, { status: 400 });
  }
  await execute(
    env.DB,
    'DELETE FROM memberships WHERE user_id = ? AND org_id = ?',
    [params.userId, locals.org?.id ?? '']
  );
  return Response.json({ success: true });
};
