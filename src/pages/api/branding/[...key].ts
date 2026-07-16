import type { APIRoute } from 'astro';
import { getFromR2 } from '../../../lib/r2';

export const prerender = false;

/**
 * GET /api/branding/{r2Key} — serve a business's branding asset (logo).
 *
 * Public and unauthenticated on purpose: the logo appears on the branded login
 * page, which people see before signing in. Access is restricted to keys under
 * `branding/` so this can't be used to read anything else in the bucket.
 *
 * R2 keys contain slashes, so callers percent-encode them into one path segment;
 * Astro doesn't decode %2F in rest params, so decode before the bucket lookup.
 */
function decodeKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const key = decodeKey(params.key);
  if (!key || !key.startsWith('branding/')) return new Response('Not found', { status: 404 });

  const object = await getFromR2(env.R2, key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  // Public and immutable — the key changes on every re-upload, so cache hard.
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
};
