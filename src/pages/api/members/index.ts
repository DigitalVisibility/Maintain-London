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

  // sees_financials: owners/admins always; managers/operatives only where the
  // owner has granted view_costs to that specific person.
  const members = await queryAll(
    env.DB,
    `SELECT m.user_id, m.role, m.created_at, u.name, u.email,
            CASE WHEN m.role IN ('owner','admin') THEN 1
                 ELSE COALESCE(uc.enabled, 0) END AS sees_financials
       FROM memberships m
       JOIN user u ON u.id = m.user_id
       LEFT JOIN user_capabilities uc
              ON uc.org_id = m.org_id AND uc.user_id = m.user_id AND uc.capability = 'view_costs'
      WHERE m.org_id = ? ORDER BY u.name`,
    [orgId]
  );
  return Response.json(members);
};
