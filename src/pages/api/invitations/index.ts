import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { can, type Role } from '../../../lib/capabilities';
import { sendEmail, emailLayout, senderFor } from '../../../lib/email';

export const prerender = false;

const VALID_ROLES: Role[] = ['owner', 'admin', 'manager', 'operative', 'client'];
const INVITE_TTL_DAYS = 14;

/** GET /api/invitations — list pending invitations for the active org */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json([]);

  const invites = await queryAll(
    env.DB,
    `SELECT id, email, name, role, project_id, token, status, expires_at, created_at
       FROM invitations WHERE org_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    [orgId]
  );
  return Response.json(invites);
};

/** POST /api/invitations — invite a staff member or client to the active org */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const org = locals.org;
  if (!org) return Response.json({ error: 'No active organisation' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as {
    email?: string; name?: string; role?: string; project_id?: string;
  };

  const email = (body.email || '').trim().toLowerCase();
  const role = (body.role || 'operative') as Role;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return Response.json({ error: 'Invalid role' }, { status: 400 });
  }
  // Clients must be tied to a project (the one they'll see).
  if (role === 'client' && !body.project_id) {
    return Response.json({ error: 'A client invite needs a project' }, { status: 400 });
  }
  // Only owners/admins may mint owners/admins.
  if ((role === 'owner' || role === 'admin') && !can(locals.role, 'manage_users')) {
    return Response.json({ error: 'Insufficient permission for that role' }, { status: 403 });
  }

  const id = generateId();
  const token = generateId() + generateId(); // long, single-use
  const timestamp = now();
  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000)
    .toISOString().replace('T', ' ').replace('Z', '');

  await execute(
    env.DB,
    `INSERT INTO invitations (id, email, name, role, project_id, org_id, token, invited_by, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, email, body.name ?? null, role, body.project_id ?? null, org.id, token, user.id, expires, timestamp]
  );

  // Email the magic link — from the business doing the inviting.
  const base = (env as any).BETTER_AUTH_URL || 'https://maintainlondon.co.uk';
  const acceptUrl = `${base}/project-hub/accept?token=${encodeURIComponent(token)}`;
  const sender = senderFor(org);
  const emailed = await sendEmail((env as any).RESEND_API_KEY, {
    to: email,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: `You've been invited to ${org.name} on Project Hub`,
    html: emailLayout({
      sender,
      heading: `Join ${org.name} on Project Hub`,
      body: `<p>${user.name || 'A team member'} has invited you to ${org.name}'s Project Hub as <strong>${role}</strong>.</p>
             <p>Click below to set your password and get started. This link expires in ${INVITE_TTL_DAYS} days.</p>`,
      ctaLabel: 'Accept invitation',
      ctaUrl: acceptUrl,
    }),
  });

  // Return the link too, so the inviter can share it manually if email fails.
  return Response.json({ id, emailed, acceptUrl }, { status: 201 });
};
