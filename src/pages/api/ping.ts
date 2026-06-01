import type { APIRoute } from 'astro';

export const prerender = false;

/** Lightweight connectivity check — no auth, no DB. Used to confirm the app is
 *  actually online rather than trusting the unreliable navigator.onLine flag. */
export const GET: APIRoute = () => new Response(null, { status: 204 });
export const HEAD: APIRoute = () => new Response(null, { status: 204 });
