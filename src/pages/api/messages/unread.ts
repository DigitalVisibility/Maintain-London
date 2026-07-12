import type { APIRoute } from 'astro';
import { queryAll, execute, generateId, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';

export const prerender = false;

/**
 * GET /api/messages/unread
 *
 * Unread message counts across every project this user can see, plus the number
 * of approvals still waiting on them. This is what the badges read from — the
 * "you have something to action" signal that didn't exist before.
 */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const isClient = locals.role === 'client';

  // A client sees only the projects they're attached to; staff see their org's.
  const projectScope = isClient
    ? { sql: 'SELECT project_id AS id FROM project_clients WHERE user_id = ?', args: [user.id] }
    : { sql: 'SELECT id FROM projects WHERE org_id = ?', args: [locals.org?.id ?? ''] };

  // Unread = posted by someone else, after the last time this user read the thread.
  // A thread never opened has no row, so everything in it is unread.
  const rows = await queryAll<{ project_id: string; unread: number }>(
    env.DB,
    `SELECT m.project_id, COUNT(*) AS unread
       FROM messages m
       LEFT JOIN message_reads r
              ON r.project_id = m.project_id AND r.user_id = ?
      WHERE m.project_id IN (${projectScope.sql})
        AND m.user_id != ?
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
      GROUP BY m.project_id`,
    [user.id, ...projectScope.args, user.id]
  );

  const byProject: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byProject[r.project_id] = r.unread;
    total += r.unread;
  }

  // Approvals waiting on this person. Clients only ever decide client-level ones.
  const approvals = await queryAll<{ n: number }>(
    env.DB,
    isClient
      ? `SELECT COUNT(*) AS n FROM approval_requests
          WHERE status = 'pending' AND required_level = 'client'
            AND project_id IN (SELECT project_id FROM project_clients WHERE user_id = ?)`
      : `SELECT COUNT(*) AS n FROM approval_requests
          WHERE status = 'pending' AND org_id = ?`,
    isClient ? [user.id] : [locals.org?.id ?? '']
  );

  return Response.json({
    total,
    by_project: byProject,
    approvals_pending: approvals[0]?.n ?? 0,
  });
};

/** POST /api/messages/unread  { project_id } — mark this thread read up to now. */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({})) as { project_id?: string };
  if (!body.project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, body.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const timestamp = now();

  // Reading the thread clears the notification stamp as well as marking it read.
  // The throttle means "we've told you and you haven't looked yet, so we won't
  // nag" — not "we've told you, so shut up for half an hour regardless". Without
  // this, you read a message, a genuinely new one arrives five minutes later, and
  // it lands silently because the throttle is still running. That is precisely
  // the failure this feature exists to prevent.
  await execute(
    env.DB,
    `INSERT INTO message_reads (id, project_id, user_id, last_read_at, last_notified_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET last_read_at = excluded.last_read_at, last_notified_at = NULL`,
    [generateId(), body.project_id, user.id, timestamp, timestamp]
  );

  return Response.json({ status: 'read' });
};
