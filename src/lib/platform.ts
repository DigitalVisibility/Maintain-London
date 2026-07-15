/**
 * Project Dash — the platform layer.
 *
 * Project Dash is a multi-business platform served from one deployment. Each
 * business gets its own subdomain (its org *slug*): a builder called
 * "Maintain London" (slug `maintain-london`) lives at
 * `maintain-london.projectdash.app`. The subdomain is authoritative — it decides
 * which business a request is acting within, overriding any cookie.
 *
 * The apex (`projectdash.app` / `www`) and a small set of reserved names are the
 * platform itself: the marketing landing and the agency area, not a business.
 */

import { queryOne } from './db';
import type { Organisation } from '../types/diary';

/** The platform's root domain. Overridable per-deployment. */
export function platformDomain(env: { PLATFORM_DOMAIN?: string }): string {
  return env?.PLATFORM_DOMAIN || 'projectdash.app';
}

/**
 * Subdomains that are the platform, not a business. A business may not take one
 * of these as its slug.
 */
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'agency', 'admin', 'api', 'mail', 'email',
  'static', 'assets', 'cdn', 'status', 'help', 'support', 'docs',
]);

/** Strip a port and lowercase — headers can carry `host:port` in dev. */
function cleanHost(host: string | null | undefined): string {
  return (host || '').split(':')[0].trim().toLowerCase();
}

/**
 * Is this request on the Project Dash platform domain at all? (False for the
 * legacy maintainlondon.co.uk host or localhost, where there's no subdomain
 * tenancy and we fall back to cookie-based org resolution.)
 */
export function isPlatformHost(host: string | null | undefined, env: { PLATFORM_DOMAIN?: string }): boolean {
  const h = cleanHost(host);
  const root = platformDomain(env);
  return h === root || h.endsWith('.' + root);
}

/**
 * The business slug encoded in the hostname, or null when the host is the apex,
 * `www`, another reserved name, or not the platform domain at all.
 *
 *   maintain-london.projectdash.app -> "maintain-london"
 *   projectdash.app                 -> null   (the landing)
 *   www.projectdash.app             -> null   (reserved)
 *   agency.projectdash.app          -> null   (reserved)
 *   maintainlondon.co.uk            -> null   (legacy host)
 */
export function businessSlugFromHost(host: string | null | undefined, env: { PLATFORM_DOMAIN?: string }): string | null {
  const h = cleanHost(host);
  const root = platformDomain(env);
  if (!h.endsWith('.' + root)) return null;
  const label = h.slice(0, h.length - root.length - 1); // drop ".<root>"
  // Only a single-label subdomain is a business (no nested a.b.projectdash.app).
  if (!label || label.includes('.')) return null;
  if (RESERVED_SUBDOMAINS.has(label)) return null;
  return label;
}

/** Absolute base URL for a business, e.g. https://maintain-london.projectdash.app */
export function baseUrlForSlug(env: { PLATFORM_DOMAIN?: string }, slug: string): string {
  return `https://${slug}.${platformDomain(env)}`;
}

/**
 * Absolute base URL for building a business's client-facing links (invites,
 * portal, approvals, invoices). Prefers the org's own subdomain; falls back to
 * the deployment's configured URL when the slug is missing.
 */
export function orgBaseUrl(
  env: { PLATFORM_DOMAIN?: string; BETTER_AUTH_URL?: string },
  org: { slug?: string | null } | null | undefined
): string {
  if (org?.slug) return baseUrlForSlug(env, org.slug);
  return env?.BETTER_AUTH_URL || `https://${platformDomain(env)}`;
}

/** The platform landing / apex URL, e.g. https://projectdash.app */
export function platformUrl(env: { PLATFORM_DOMAIN?: string }): string {
  return `https://${platformDomain(env)}`;
}

/** Look up an organisation by its slug (the subdomain). */
export async function loadOrgBySlug(db: D1Database, slug: string): Promise<Organisation | null> {
  return queryOne<Organisation>(
    db,
    'SELECT id, name, slug, brand_color, logo_url, email_from, created_at FROM organisations WHERE slug = ?',
    [slug]
  );
}

/** Just the slug for an org id — for building links from background jobs. */
export async function slugForOrg(db: D1Database, orgId: string): Promise<string | null> {
  const row = await queryOne<{ slug: string | null }>(
    db, 'SELECT slug FROM organisations WHERE id = ?', [orgId]
  );
  return row?.slug ?? null;
}
