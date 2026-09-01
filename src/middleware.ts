import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';
import { resolveActiveOrg, loadOrg, isPlatformAdmin, ACTIVE_ORG_COOKIE, HUB_ORG_ID } from './lib/org';
import { effectiveCapabilities, ALL_CAPABILITIES, type CapabilityOverride, type UserCapabilityOverride } from './lib/capabilities';
import { queryAll } from './lib/db';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Protected Hub pages (not the login or invite-accept pages, which must be
  // reachable while signed out).
  const isHubPage =
    pathname.startsWith('/project-hub') &&
    !pathname.startsWith('/project-hub/login') &&
    !pathname.startsWith('/project-hub/accept') &&
    !pathname.startsWith('/project-hub/approve');

  // Better-Auth's own endpoints handle their auth internally — leave them alone.
  const isAuthAPI = pathname.startsWith('/api/auth');

  // Data APIs (weather, entries, photos, projects, reports, …) need the session
  // resolved onto locals.user so each endpoint can authorise the request.
  // /api/ping is a public connectivity check — no session lookup needed.
  const isDataAPI = pathname.startsWith('/api/') && !isAuthAPI && pathname !== '/api/ping';

  // Anything else (marketing pages, login, /api/auth/*) needs no handling here.
  if (!isHubPage && !isDataAPI) {
    return next();
  }

  const { env } = context.locals.runtime;

  // Skip auth check if no DB binding (e.g. during prerender)
  if (!env?.DB) {
    return next();
  }

  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);

  const sessionData = await auth.api.getSession({
    headers: context.request.headers,
  });

  // Attach user and session to locals when present (used by pages and APIs).
  if (sessionData) {
    context.locals.user = sessionData.user as App.Locals['user'];
    context.locals.session = sessionData.session as App.Locals['session'];

    const cookieOrg = context.cookies.get(ACTIVE_ORG_COOKIE)?.value;
    const platformAdmin = await isPlatformAdmin(env.DB, sessionData.user.id);
    context.locals.isPlatformAdmin = platformAdmin;

    if (platformAdmin) {
      // Admin on a single-tenant site: always Maintain London, cookie or not.
      // This used to load whichever org the `active_org` cookie named and set
      // nothing at all when the cookie was missing — which left org_id empty
      // and rendered an empty dashboard, since every query is scoped by it.
      // Falls back to the cookie if HUB_ORG_ID doesn't resolve, so a renamed or
      // differently-seeded org row degrades to today's behaviour instead of
      // leaving an admin with no org at all.
      const org =
        (await loadOrg(env.DB, HUB_ORG_ID)) ||
        (cookieOrg ? await loadOrg(env.DB, cookieOrg) : null);
      if (org) {
        context.locals.org = org;
        context.locals.role = 'owner';
        context.locals.capabilities = [...ALL_CAPABILITIES];
        context.locals.memberships = [];
      }
    } else {
      // Normal user: scoped to the orgs they're a member of.
      const resolved = await resolveActiveOrg(env.DB, sessionData.user.id, cookieOrg);
      if (resolved) {
        context.locals.org = resolved.org;
        context.locals.role = resolved.role;
        context.locals.memberships = resolved.memberships;

        const overrides = await queryAll<CapabilityOverride>(
          env.DB,
          'SELECT role, capability, enabled FROM role_capabilities WHERE org_id = ?',
          [resolved.org.id]
        ).catch(() => [] as CapabilityOverride[]);
        // This person's own grants (e.g. the owner gave this manager financials).
        const userOverrides = await queryAll<UserCapabilityOverride>(
          env.DB,
          'SELECT capability, enabled FROM user_capabilities WHERE org_id = ? AND user_id = ?',
          [resolved.org.id, sessionData.user.id]
        ).catch(() => [] as UserCapabilityOverride[]);
        context.locals.capabilities = effectiveCapabilities(resolved.role, overrides, userOverrides);
      }
    }
  }

  // Hub pages redirect to login when unauthenticated; data APIs return their
  // own 401 (so callers get a proper status code rather than an HTML redirect).
  if (isHubPage && !sessionData) {
    return context.redirect('/project-hub/login');
  }

  // Clients only ever see their portal — keep them out of the management UI.
  if (isHubPage && sessionData && context.locals.role === 'client'
      && !pathname.startsWith('/project-hub/portal')) {
    return context.redirect('/project-hub/portal');
  }

  // Platform admins live on the agency dashboard until they enter a business.
  if (isHubPage && context.locals.isPlatformAdmin && !context.locals.org
      && !pathname.startsWith('/project-hub/agency')) {
    return context.redirect('/project-hub/agency');
  }

  // Signed in, but `resolveActiveOrg` found no memberships row, so no org is set.
  // Every Hub query is scoped by org_id, which would be '' here — the dashboard
  // then renders "No projects yet" and looks exactly like a business with no work
  // on. Say what's actually wrong instead of showing an empty Hub.
  if (isHubPage && sessionData && !context.locals.isPlatformAdmin && !context.locals.org
      && !pathname.startsWith('/project-hub/no-business')) {
    return context.redirect('/project-hub/no-business');
  }

  return next();
});
