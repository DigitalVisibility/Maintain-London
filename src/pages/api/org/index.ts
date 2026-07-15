import type { APIRoute } from 'astro';
import { queryAll, execute, generateId, now } from '../../../lib/db';
import { sendEmail, emailLayout } from '../../../lib/email';
import { baseUrlForSlug } from '../../../lib/platform';

export const prerender = false;

/** GET /api/org — list all organisations with counts (platform admin only) */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!locals.isPlatformAdmin) return new Response('Forbidden', { status: 403 });
  const { env } = locals.runtime;

  const orgs = await queryAll(
    env.DB,
    `SELECT o.id, o.name, o.brand_color, o.logo_url,
            (SELECT COUNT(*) FROM projects p WHERE p.org_id = o.id) AS project_count,
            (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) AS member_count
       FROM organisations o ORDER BY o.name`
  );
  return Response.json(orgs);
};

/**
 * POST /api/org  { name, brand_color?, logo_url?, owner_email?, owner_name? }
 * Create a new business (platform admin). Optionally invite its owner by email.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!locals.isPlatformAdmin) return new Response('Forbidden', { status: 403 });
  const { env } = locals.runtime;

  const body = await request.json().catch(() => ({})) as {
    name?: string; brand_color?: string; logo_url?: string; owner_email?: string; owner_name?: string;
  };
  if (!body.name?.trim()) return Response.json({ error: 'Business name is required' }, { status: 400 });

  const id = generateId();
  const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  await execute(
    env.DB,
    `INSERT INTO organisations (id, name, slug, brand_color, logo_url, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, body.name.trim(), slug || id, body.brand_color || '#AEDE4A', body.logo_url || null, now()]
  );

  // Optionally invite the business owner.
  let ownerInvited = false;
  const email = (body.owner_email || '').trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const token = generateId() + generateId();
    const expires = new Date(Date.now() + 14 * 86400_000).toISOString().replace('T', ' ').replace('Z', '');
    await execute(
      env.DB,
      `INSERT INTO invitations (id, email, name, role, project_id, org_id, token, invited_by, status, expires_at, created_at)
       VALUES (?, ?, ?, 'owner', NULL, ?, ?, ?, 'pending', ?, ?)`,
      [generateId(), email, body.owner_name ?? null, id, token, locals.user.id, expires, now()]
    );
    const base = baseUrlForSlug(env, slug || id);
    const acceptUrl = `${base}/project-hub/accept?token=${encodeURIComponent(token)}`;
    ownerInvited = await sendEmail((env as any).RESEND_API_KEY, {
      to: email,
      subject: `You've been set up as owner of ${body.name.trim()} on Project Dash`,
      html: emailLayout({
        heading: `Welcome to ${body.name.trim()}`,
        body: `<p>You've been set up as the owner of <strong>${body.name.trim()}</strong>'s Project Dash. Click below to set your password.</p>`,
        ctaLabel: 'Set up your account', ctaUrl: acceptUrl,
      }),
    });
  }

  return Response.json({ id, ownerInvited }, { status: 201 });
};
