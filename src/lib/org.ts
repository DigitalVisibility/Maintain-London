/**
 * Multi-tenant helpers: resolve which organisation (tenant) a request is acting
 * within, based on the signed-in user's memberships and an `active_org` cookie.
 *
 * A user can belong to several orgs (e.g. an owner running multiple businesses).
 * The active org is chosen by cookie when valid, otherwise the first membership.
 */

import { queryAll } from './db';
import type { MembershipWithOrg, Organisation } from '../types/diary';

export const ACTIVE_ORG_COOKIE = 'active_org';

/** All orgs the user belongs to, with branding, ordered by name. */
export async function getMemberships(db: D1Database, userId: string): Promise<MembershipWithOrg[]> {
  return queryAll<MembershipWithOrg>(
    db,
    `SELECT m.id, m.user_id, m.org_id, m.role, m.created_at,
            o.name AS org_name, o.slug AS org_slug, o.brand_color, o.logo_url
       FROM memberships m
       JOIN organisations o ON o.id = m.org_id
      WHERE m.user_id = ?
      ORDER BY o.name`,
    [userId]
  );
}

export interface ResolvedOrg {
  org: Organisation;
  role: string;
  memberships: MembershipWithOrg[];
}

/**
 * Resolve the active org for a user. Returns null if the user has no
 * memberships (e.g. a brand-new account not yet attached to any business).
 */
export async function resolveActiveOrg(
  db: D1Database,
  userId: string,
  cookieOrgId?: string | null
): Promise<ResolvedOrg | null> {
  const memberships = await getMemberships(db, userId);
  if (memberships.length === 0) return null;

  const chosen =
    (cookieOrgId && memberships.find((m) => m.org_id === cookieOrgId)) || memberships[0];

  return {
    org: {
      id: chosen.org_id,
      name: chosen.org_name,
      slug: chosen.org_slug,
      brand_color: chosen.brand_color,
      logo_url: chosen.logo_url,
      created_at: '',
    },
    role: chosen.role,
    memberships,
  };
}
