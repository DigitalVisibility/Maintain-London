/**
 * Multi-tenant helpers: resolve which organisation (tenant) a request is acting
 * within, based on the signed-in user's memberships and an `active_org` cookie.
 *
 * A user can belong to several orgs (e.g. an owner running multiple businesses).
 * The active org is chosen by cookie when valid, otherwise the first membership.
 */

import { queryAll, queryOne } from './db';
import type { MembershipWithOrg, Organisation } from '../types/diary';

export const ACTIVE_ORG_COOKIE = 'active_org';

/**
 * Project Hub is single-tenant: it is Maintain London's own site and serves no
 * other business. The multi-business machinery below is the ancestor of Project
 * Dash, which now lives in its own repo against its own database.
 *
 * Pinning the org here is what stops another `organisations` row from capturing
 * the session. The old fallback picked `memberships[0]` ordered by name, so any
 * business sorting before "Maintain London" would silently become the active
 * one and the dashboard would render empty — every query is scoped by org_id.
 */
export const HUB_ORG_ID = 'org-maintain-london';

/** Load a single organisation by id (used for platform-admin god-access). */
export async function loadOrg(db: D1Database, id: string): Promise<Organisation | null> {
  return queryOne<Organisation>(
    db,
    'SELECT id, name, slug, brand_color, logo_url, email_from, created_at FROM organisations WHERE id = ?',
    [id]
  );
}

/** Is this user a platform (agency) super-admin? */
export async function isPlatformAdmin(db: D1Database, userId: string): Promise<boolean> {
  const row = await queryOne<{ platform_admin: number }>(
    db, 'SELECT platform_admin FROM user WHERE id = ?', [userId]
  );
  return row?.platform_admin === 1;
}

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

  // Pinned, not chosen — see HUB_ORG_ID. The cookie is deliberately ignored:
  // there is only one business here, so there is nothing to switch to.
  const chosen =
    memberships.find((m) => m.org_id === HUB_ORG_ID) ||
    // Only reached if HUB_ORG_ID doesn't match a real row (a renamed org). Keeps
    // the previous cookie-then-first behaviour so this can never be a regression.
    (cookieOrgId && memberships.find((m) => m.org_id === cookieOrgId)) ||
    memberships[0];

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
    // Only ever the one. The sidebar shows its business switcher when this has
    // more than one entry, and Tom should never see that control.
    memberships: [chosen],
  };
}
