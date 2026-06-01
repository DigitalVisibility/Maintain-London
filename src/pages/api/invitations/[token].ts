import type { APIRoute } from 'astro';
import { queryOne, execute, generateId, now } from '../../../lib/db';
import { can } from '../../../lib/capabilities';

export const prerender = false;

interface InviteRow {
  id: string; email: string; name: string | null; role: string;
  project_id: string | null; org_id: string; status: string; expires_at: string;
}

async function loadValidInvite(env: any, token: string | undefined): Promise<InviteRow | null> {
  if (!token) return null;
  const invite = await queryOne<InviteRow>(
    env.DB, 'SELECT * FROM invitations WHERE token = ?', [token]
  );
  if (!invite || invite.status !== 'pending') return null;
  if (new Date(invite.expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now()) return null;
  return invite;
}

/** GET /api/invitations/:token — validate an invite (public; powers the accept page) */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const invite = await loadValidInvite(env, params.token);
  if (!invite) return Response.json({ valid: false }, { status: 404 });

  const org = await queryOne<{ name: string }>(env.DB, 'SELECT name FROM organisations WHERE id = ?', [invite.org_id]);
  return Response.json({
    valid: true,
    email: invite.email,
    name: invite.name,
    role: invite.role,
    org_name: org?.name ?? 'Project Hub',
  });
};

/**
 * POST /api/invitations/:token  — finalise onboarding.
 * The user has just signed up (so they're authenticated). We verify the invite,
 * assign the role + organisation membership SERVER-SIDE (never from the client),
 * link clients to their project, and mark the invite accepted.
 */
export const POST: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const invite = await loadValidInvite(env, params.token);
  if (!invite) return Response.json({ error: 'Invitation is invalid or expired' }, { status: 400 });

  if (invite.email.toLowerCase() !== (user.email || '').toLowerCase()) {
    return Response.json({ error: 'This invitation was issued to a different email address.' }, { status: 403 });
  }

  const timestamp = now();

  // Role lives on the user record (kept in sync with their membership role).
  await execute(env.DB, 'UPDATE user SET role = ? WHERE id = ?', [invite.role, user.id]);

  // Membership: which org + role. (Idempotent on the unique user/org pair.)
  await execute(
    env.DB,
    `INSERT INTO memberships (id, user_id, org_id, role, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, org_id) DO UPDATE SET role = excluded.role`,
    [generateId(), user.id, invite.org_id, invite.role, timestamp]
  );

  // Clients are attached to the specific project they're allowed to see.
  if (invite.role === 'client' && invite.project_id) {
    await execute(
      env.DB,
      `INSERT OR IGNORE INTO project_clients (id, project_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
      [generateId(), invite.project_id, user.id, timestamp]
    );
  }

  await execute(
    env.DB,
    `UPDATE invitations SET status = 'accepted', accepted_at = ? WHERE id = ?`,
    [timestamp, invite.id]
  );

  return Response.json({
    success: true,
    role: invite.role,
    redirect: invite.role === 'client' ? '/project-hub/portal' : '/project-hub/',
  });
};

/** DELETE /api/invitations/:token — revoke a pending invite */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'manage_users')) return new Response('Forbidden', { status: 403 });

  await execute(
    env.DB,
    `UPDATE invitations SET status = 'revoked' WHERE token = ? AND org_id = ?`,
    [params.token, locals.org?.id ?? '']
  );
  return Response.json({ success: true });
};
