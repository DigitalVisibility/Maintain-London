import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';
import { isPlatformHost, platformDomain } from '../../../lib/platform';

export const prerender = false;

const handleAuth: APIRoute = async ({ locals, request, url }) => {
  const { env } = locals.runtime;
  // On the platform, authenticate against the current subdomain so cookies are
  // set for the host the user is actually on; share them across *.projectdash.app.
  const onPlatform = isPlatformHost(request.headers.get('host'), env);
  const baseURL = onPlatform ? url.origin : env.BETTER_AUTH_URL;
  const auth = createAuth(
    env.DB, env.BETTER_AUTH_SECRET, baseURL, onPlatform ? platformDomain(env) : undefined
  );
  return auth.handler(request);
};

export const ALL = handleAuth;
