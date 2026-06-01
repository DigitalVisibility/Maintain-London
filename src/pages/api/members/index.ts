import type { APIRoute } from 'astro';
import { queryAll } from '../../../lib/db';
import { can } from '../../../lib/capabilities';

export const prerender = false;

/** GET /api/members — people who belong to the active organisation */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json([]);

  const members = await queryAll(
    env.DB,
    `SELECT m.user_id, m.role, m.created_at, u.name, u.email
       FROM memberships m JOIN user u ON u.id = m.user_id
      WHERE m.org_id = ? ORDER BY u.name`,
    [orgId]
  );
  return Response.json(members);
};
