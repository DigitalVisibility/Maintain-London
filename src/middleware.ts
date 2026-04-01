import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Only guard /project-hub/* pages (not login)
  const isProtectedRoute =
    pathname.startsWith('/project-hub') && !pathname.startsWith('/project-hub/login');

  // API auth routes are handled by Better-Auth directly
  const isAuthAPI = pathname.startsWith('/api/auth');

  if (!isProtectedRoute && !isAuthAPI) {
    return next();
  }

  const { env } = context.locals.runtime;

  // Skip auth check if no DB binding (e.g. during prerender)
  if (!env?.DB) {
    return next();
  }

  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);

  // For auth API routes, just pass through (Better-Auth handles everything)
  if (isAuthAPI) {
    return next();
  }

  // For protected routes, verify the session
  const sessionData = await auth.api.getSession({
    headers: context.request.headers,
  });

  if (!sessionData) {
    return context.redirect('/project-hub/login');
  }

  // Attach user and session to locals for page components
  context.locals.user = sessionData.user as App.Locals['user'];
  context.locals.session = sessionData.session as App.Locals['session'];

  return next();
});
