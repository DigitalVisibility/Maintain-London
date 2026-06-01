import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';

export const prerender = false;

interface ApprovalRow {
  id: string; description: string; est_cost: number | null; status: string;
  required_level: string; is_emergency: number; requested_by_name: string | null;
  project_id: string;
}

/** GET /api/approvals/decide?token= — validate a magic link and return the request */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  const token = url.searchParams.get('token');
  if (!token) return Response.json({ valid: false }, { status: 400 });

  const req = await queryOne<ApprovalRow & { org_id: string }>(
    env.DB, 'SELECT * FROM approval_requests WHERE decide_token = ?', [token]
  );
  if (!req) return Response.json({ valid: false }, { status: 404 });

  const project = await queryOne<{ name: string }>(env.DB, 'SELECT name FROM projects WHERE id = ?', [req.project_id]);
  return Response.json({
    valid: true,
    description: req.description,
    est_cost: req.est_cost,
    status: req.status,
    is_emergency: !!req.is_emergency,
    requested_by: req.requested_by_name,
    project_name: project?.name ?? '',
  });
};

/**
 * POST /api/approvals/decide  { token, decision } — one-tap decision from the
 * emailed magic link. The token is the proof of authority, so no login needed.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const body = await request.json().catch(() => ({})) as { token?: string; decision?: string };
  if (!body.token) return Response.json({ error: 'token is required' }, { status: 400 });

  const req = await queryOne<ApprovalRow>(
    env.DB, 'SELECT * FROM approval_requests WHERE decide_token = ?', [body.token]
  );
  if (!req) return Response.json({ error: 'Invalid link' }, { status: 404 });
  if (req.status === 'approved' || req.status === 'rejected') {
    return Response.json({ success: true, status: req.status, already: true });
  }

  const status = body.decision === 'reject' ? 'rejected' : 'approved';
  await execute(
    env.DB,
    `UPDATE approval_requests SET status = ?, approver_name = ?, decided_at = ? WHERE id = ?`,
    [status, 'Decided via secure link', now(), req.id]
  );
  return Response.json({ success: true, status });
};
