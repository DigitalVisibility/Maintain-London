import type { APIRoute } from 'astro';
import { queryOne } from '../../../lib/db';
import { ACTIVE_ORG_COOKIE } from '../../../lib/org';

export const prerender = false;

/**
 * POST /api/org/switch  { org_id }
 * Switch the active organisation. Only allowed if the user is a member of the
 * target org. Sets the active_org cookie; the middleware reads it per request.
 */
export const POST: APIRoute = async ({ locals, request, cookies }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({})) as { org_id?: string };
  if (!body.org_id) {
    return Response.json({ error: 'org_id is required' }, { status: 400 });
  }

  // Verify membership before switching.
  const membership = await queryOne<{ id: string }>(
    env.DB,
    'SELECT id FROM memberships WHERE user_id = ? AND org_id = ?',
    [user.id, body.org_id]
  );
  if (!membership) {
    return Response.json({ error: 'Not a member of that organisation' }, { status: 403 });
  }

  cookies.set(ACTIVE_ORG_COOKIE, body.org_id, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 365,
  });

  return Response.json({ success: true, org_id: body.org_id });
};
