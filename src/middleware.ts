import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';
import {
  resolveActiveOrg, getMemberships, loadOrg, isPlatformAdmin, ACTIVE_ORG_COOKIE,
} from './lib/org';
import {
  effectiveCapabilities, ALL_CAPABILITIES,
  type CapabilityOverride, type UserCapabilityOverride,
} from './lib/capabilities';
import {
  isPlatformHost, businessSlugFromHost, loadOrgBySlug, platformDomain, platformUrl,
} from './lib/platform';
import { queryAll } from './lib/db';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const { env } = context.locals.runtime;

  // ── Host / tenancy context ────────────────────────────────────────────────
  const host = context.request.headers.get('host');
  const onPlatform = env?.DB ? isPlatformHost(host, env) : false;
  const businessSlug = onPlatform ? businessSlugFromHost(host, env) : null;

  // On a business subdomain the app is the whole site — send the bare root to it.
  if (businessSlug && (pathname === '/' || pathname === '')) {
    return context.redirect('/project-hub/');
  }

  // Protected Hub pages (not the login/invite/switch pages, which must be
  // reachable while signed out or without a business).
  const isHubPage =
    pathname.startsWith('/project-hub') &&
    !pathname.startsWith('/project-hub/login') &&
    !pathname.startsWith('/project-hub/accept') &&
    !pathname.startsWith('/project-hub/approve') &&
    !pathname.startsWith('/project-hub/switch');

  const isAuthAPI = pathname.startsWith('/api/auth');
  const isDataAPI = pathname.startsWith('/api/') && !isAuthAPI && pathname !== '/api/ping';

  if (!isHubPage && !isDataAPI) {
    return next();
  }

  if (!env?.DB) {
    return next();
  }

  // ── Session ───────────────────────────────────────────────────────────────
  // On the platform, authenticate against the current host and share the cookie
  // across *.projectdash.app; on the legacy host keep the configured base URL.
  const baseURL = onPlatform ? context.url.origin : env.BETTER_AUTH_URL;
  const auth = createAuth(
    env.DB, env.BETTER_AUTH_SECRET, baseURL, onPlatform ? platformDomain(env) : undefined
  );
  const sessionData = await auth.api.getSession({ headers: context.request.headers });

  // Build a user's effective capabilities within an org (defaults + per-role +
  // per-user overrides).
  async function capsFor(orgId: string, userId: string, role: string): Promise<string[]> {
    const overrides = await queryAll<CapabilityOverride>(
      env.DB, 'SELECT role, capability, enabled FROM role_capabilities WHERE org_id = ?', [orgId]
    ).catch(() => [] as CapabilityOverride[]);
    const userOverrides = await queryAll<UserCapabilityOverride>(
      env.DB, 'SELECT capability, enabled FROM user_capabilities WHERE org_id = ? AND user_id = ?',
      [orgId, userId]
    ).catch(() => [] as UserCapabilityOverride[]);
    return effectiveCapabilities(role, overrides, userOverrides);
  }

  if (sessionData) {
    context.locals.user = sessionData.user as App.Locals['user'];
    context.locals.session = sessionData.session as App.Locals['session'];
    const userId = sessionData.user.id;
    const platformAdmin = await isPlatformAdmin(env.DB, userId);
    context.locals.isPlatformAdmin = platformAdmin;

    if (businessSlug) {
      // ── Subdomain pins the business (authoritative, ignores cookie) ─────────
      const pinnedOrg = await loadOrgBySlug(env.DB, businessSlug);
      if (!pinnedOrg) {
        // Unknown business — bounce to the platform landing.
        if (isHubPage) return Response.redirect(platformUrl(env), 302);
        return new Response('Unknown business', { status: 404 });
      }
      const memberships = await getMemberships(env.DB, userId);
      context.locals.memberships = memberships;
      const mine = memberships.find((m) => m.org_id === pinnedOrg.id);

      if (platformAdmin) {
        context.locals.org = pinnedOrg;
        context.locals.role = 'owner';
        context.locals.capabilities = [...ALL_CAPABILITIES];
      } else if (mine) {
        context.locals.org = pinnedOrg;
        context.locals.role = mine.role;
        context.locals.capabilities = await capsFor(pinnedOrg.id, userId, mine.role);
      }
      // else: signed in but not a member of THIS business → org stays null;
      // the redirect block below sends them to the switch page. Isolation holds.
    } else if (onPlatform) {
      // ── Platform apex / reserved host: no business pinned ───────────────────
      // Platform admins fall through to the agency dashboard; everyone else is
      // routed to the switch page to pick one of their businesses.
      context.locals.memberships = await getMemberships(env.DB, userId);
    } else {
      // ── Legacy single-domain host: cookie-based org resolution ──────────────
      const cookieOrg = context.cookies.get(ACTIVE_ORG_COOKIE)?.value;
      if (platformAdmin) {
        if (cookieOrg) {
          const org = await loadOrg(env.DB, cookieOrg);
          if (org) {
            context.locals.org = org;
            context.locals.role = 'owner';
            context.locals.capabilities = [...ALL_CAPABILITIES];
          }
        }
      } else {
        const resolved = await resolveActiveOrg(env.DB, userId, cookieOrg);
        if (resolved) {
          context.locals.org = resolved.org;
          context.locals.role = resolved.role;
          context.locals.memberships = resolved.memberships;
          context.locals.capabilities = await capsFor(resolved.org.id, userId, resolved.role);
        }
      }
    }
  }

  // ── Redirects for Hub pages ────────────────────────────────────────────────
  if (isHubPage && !sessionData) {
    return context.redirect('/project-hub/login');
  }

  // Clients only ever see their portal.
  if (isHubPage && sessionData && context.locals.role === 'client'
      && !pathname.startsWith('/project-hub/portal')) {
    return context.redirect('/project-hub/portal');
  }

  // Platform admins live on the agency dashboard until they enter a business.
  if (isHubPage && context.locals.isPlatformAdmin && !context.locals.org
      && !pathname.startsWith('/project-hub/agency')) {
    return context.redirect('/project-hub/agency');
  }

  // On the platform, a signed-in non-admin with no resolved business (wrong
  // subdomain, or the apex) picks one from the switch page.
  if (isHubPage && onPlatform && sessionData && !context.locals.isPlatformAdmin
      && !context.locals.org) {
    return context.redirect('/project-hub/switch');
  }

  return next();
});
