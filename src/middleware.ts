import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Protected Hub pages (not the login page itself)
  const isHubPage =
    pathname.startsWith('/project-hub') && !pathname.startsWith('/project-hub/login');

  // Better-Auth's own endpoints handle their auth internally — leave them alone.
  const isAuthAPI = pathname.startsWith('/api/auth');

  // Data APIs (weather, entries, photos, projects, reports, …) need the session
  // resolved onto locals.user so each endpoint can authorise the request.
  const isDataAPI = pathname.startsWith('/api/') && !isAuthAPI;

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
  }

  // Hub pages redirect to login when unauthenticated; data APIs return their
  // own 401 (so callers get a proper status code rather than an HTML redirect).
  if (isHubPage && !sessionData) {
    return context.redirect('/project-hub/login');
  }

  return next();
});
