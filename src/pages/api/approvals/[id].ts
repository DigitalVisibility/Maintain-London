import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';
import { canAccessProject } from '../../../lib/access';
import { syncVariationFromApproval } from '../../../lib/approvals';

export const prerender = false;

interface ApprovalRow {
  id: string; org_id: string; project_id: string; required_level: string; status: string;
  variation_id: string | null;
}

/** PATCH /api/approvals/:id  { decision: 'approve' | 'reject' } — decide in-app */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });
  const orgId = locals.org?.id;

  const req = await queryOne<ApprovalRow>(
    env.DB, 'SELECT * FROM approval_requests WHERE id = ? AND org_id = ?', [params.id, orgId ?? '']
  );
  if (!req) return Response.json({ error: 'Not found' }, { status: 404 });
  if (req.status === 'approved' || req.status === 'rejected') {
    return Response.json({ error: 'Already decided' }, { status: 409 });
  }

  // The org check alone was not enough. A client is a member of the org and has
  // approve_works, so this let one client approve — or reject — thousands of
  // pounds of work on *another* client's house. Deciding on a project requires
  // access to that project.
  if (!(await canAccessProject(env.DB, locals, req.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!hasCap(locals, 'approve_works')) return new Response('Forbidden', { status: 403 });
  if (req.required_level === 'client' && locals.role === 'manager') {
    return Response.json({ error: 'This needs the client to approve.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { decision?: string };
  const status = body.decision === 'reject' ? 'rejected' : 'approved';

  await execute(
    env.DB,
    `UPDATE approval_requests SET status = ?, approver_id = ?, approver_name = ?, decided_at = ? WHERE id = ?`,
    [status, user.id, user.name ?? null, now(), params.id]
  );

  // Mirror the decision onto the register if this approval was raised by a variation.
  await syncVariationFromApproval(env.DB, { ...req, status }, user.name ?? null);

  return Response.json({ success: true, status });
};
