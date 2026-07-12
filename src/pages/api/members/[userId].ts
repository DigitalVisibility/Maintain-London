import type { APIRoute } from 'astro';
import { execute } from '../../../lib/db';
import { can, type Role } from '../../../lib/capabilities';

export const prerender = false;

const VALID_ROLES: Role[] = ['owner', 'admin', 'manager', 'operative', 'client'];

/** PATCH /api/members/:userId  { role } — change a member's role within the active org */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json({ error: 'No active organisation' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { role?: string };
  const role = body.role as Role;
  if (!VALID_ROLES.includes(role)) return Response.json({ error: 'Invalid role' }, { status: 400 });

  await execute(
    env.DB,
    'UPDATE memberships SET role = ? WHERE user_id = ? AND org_id = ?',
    [role, params.userId, orgId]
  );
  // Keep the user's primary role in sync (used only as a fallback). Guard it to
  // this org's members — the `user` table is shared across tenants, and an
  // unscoped write here would let an admin of one business rewrite the role of a
  // user who only belongs to another.
  await execute(
    env.DB,
    `UPDATE user SET role = ?
      WHERE id = ? AND EXISTS (
        SELECT 1 FROM memberships WHERE user_id = ? AND org_id = ?
      )`,
    [role, params.userId, params.userId, orgId]
  );
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
