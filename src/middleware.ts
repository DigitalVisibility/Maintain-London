import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';
import { resolveActiveOrg, ACTIVE_ORG_COOKIE } from './lib/org';

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

    // Resolve the active organisation (tenant) for this request.
    const cookieOrg = context.cookies.get(ACTIVE_ORG_COOKIE)?.value;
    const resolved = await resolveActiveOrg(env.DB, sessionData.user.id, cookieOrg);
    if (resolved) {
      context.locals.org = resolved.org;
      context.locals.role = resolved.role;
      context.locals.memberships = resolved.memberships;
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

  return next();
});
