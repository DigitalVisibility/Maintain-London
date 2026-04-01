import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';

export const prerender = false;

const handleAuth: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL);
  return auth.handler(request);
};

export const ALL = handleAuth;
