import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';
import { isValidSlug, isValidHexColor, baseUrlForSlug, isPlatformHost, platformDomain } from '../../../lib/platform';

export const prerender = false;

/** GET /api/org/branding — the active business's name, colour, logo and subdomain. */
export const GET: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const org = await queryOne<{ name: string; slug: string | null; brand_color: string; logo_url: string | null }>(
    env.DB, 'SELECT name, slug, brand_color, logo_url FROM organisations WHERE id = ?', [locals.org.id]
  );
  if (!org) return new Response('Not found', { status: 404 });

  const onPlatform = isPlatformHost(request.headers.get('host'), env);
  return Response.json({
    ...org,
    platformDomain: platformDomain(env),
    onPlatform,
    subdomainUrl: org.slug && onPlatform ? baseUrlForSlug(env, org.slug) : null,
  });
};

/**
 * PATCH /api/org/branding  { name?, brand_color?, slug? }
 * Update the active business's branding. Owners/admins only. Changing the slug
 * changes the business's web address (subdomain).
 */
export const PATCH: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as { name?: string; brand_color?: string; slug?: string };
  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return Response.json({ error: 'Business name cannot be empty.' }, { status: 400 });
    sets.push('name = ?'); values.push(name);
  }

  if (body.brand_color !== undefined) {
    if (!isValidHexColor(body.brand_color)) {
      return Response.json({ error: 'Brand colour must be a hex value like #AEDE4A.' }, { status: 400 });
    }
    sets.push('brand_color = ?'); values.push(body.brand_color.toUpperCase());
  }

  let newSlug: string | null = null;
  if (body.slug !== undefined) {
    const slug = body.slug.trim().toLowerCase();
    if (!isValidSlug(slug)) {
      return Response.json({ error: 'Web address can only use lowercase letters, numbers and hyphens (2–40 characters), and can’t be a reserved word.' }, { status: 400 });
    }
    const taken = await queryOne<{ id: string }>(
      env.DB, 'SELECT id FROM organisations WHERE slug = ? AND id <> ?', [slug, locals.org.id]
    );
    if (taken) return Response.json({ error: 'That web address is already taken.' }, { status: 409 });
    sets.push('slug = ?'); values.push(slug); newSlug = slug;
  }

  if (sets.length === 0) return Response.json({ error: 'Nothing to update.' }, { status: 400 });

  values.push(locals.org.id);
  await execute(env.DB, `UPDATE organisations SET ${sets.join(', ')} WHERE id = ?`, values);

  const onPlatform = isPlatformHost(request.headers.get('host'), env);
  return Response.json({
    success: true,
    // When the slug changed on the platform, the caller needs to move to the new
    // subdomain (the current one no longer resolves to this business).
    newSubdomainUrl: newSlug && onPlatform ? baseUrlForSlug(env, newSlug) + '/project-hub/settings' : null,
  });
};
