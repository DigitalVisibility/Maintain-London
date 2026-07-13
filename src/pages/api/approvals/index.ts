import type { APIRoute } from 'astro';
import { queryAll, queryOne } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';
import { canAccessProject } from '../../../lib/access';
import { raiseApproval } from '../../../lib/approvals';

export const prerender = false;

interface ProjectRow {
  id: string; org_id: string; name: string;
  approval_auto_limit: number; approval_manager_limit: number;
}

/**
 * GET /api/approvals?project_id=&status= — list approval requests.
 *
 * Scoping by org alone is not enough. A client is a *member* of the org, so an
 * org-only filter let one client read another client's variations — descriptions
 * and costs of works on someone else's house. Staff see the whole org; a client
 * sees only the projects they are actually attached to.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json([]);

  const projectId = url.searchParams.get('project_id');
  const status = url.searchParams.get('status');
  const isClient = locals.role === 'client';

  if (projectId && !(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  let sql = 'SELECT * FROM approval_requests WHERE org_id = ?';
  const params: unknown[] = [orgId];

  if (projectId) {
    sql += ' AND project_id = ?';
    params.push(projectId);
  } else if (isClient) {
    // An unfiltered list must not become a window onto the whole business.
    sql += ' AND project_id IN (SELECT project_id FROM project_clients WHERE user_id = ?)';
    params.push(locals.user.id);
  }

  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';

  return Response.json(await queryAll(env.DB, sql, params));
};

/**
 * POST /api/approvals — raise an additional-works request.
 * Body: { project_id, type, description, est_cost, photo_key?, is_emergency? }
 * Tiered: auto-approve under the project's auto limit, manager up to the manager
 * limit, client above. Emergencies proceed immediately and notify everyone.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Raising works is a *site team* action. The old check let anyone with
  // approve_works through — which includes clients, so a client could raise
  // (and, under the auto limit, silently self-approve) works on someone else's
  // project. Approving is not requesting.
  if (!hasCap(locals, 'request_works')) {
    return new Response('Forbidden', { status: 403 });
  }

  const orgId = locals.org?.id;
  if (!orgId) return Response.json({ error: 'No active organisation' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; type?: string; description?: string;
    est_cost?: number; photo_key?: string; is_emergency?: boolean; reason?: string;
  };
  if (!body.project_id || !body.description?.trim()) {
    return Response.json({ error: 'project_id and description are required' }, { status: 400 });
  }

  if (!(await canAccessProject(env.DB, locals, body.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const project = await queryOne<ProjectRow>(
    env.DB, 'SELECT * FROM projects WHERE id = ? AND org_id = ?', [body.project_id, orgId]
  );
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const { id, status, level } = await raiseApproval(env, {
    project,
    type: body.type ?? 'additional_work',
    description: body.description,
    cost: typeof body.est_cost === 'number' ? body.est_cost : null,
    requestedBy: user.id,
    requestedByName: user.name ?? null,
    isEmergency: body.is_emergency,
    reason: body.reason,
    photoKey: body.photo_key,
  });

  return Response.json({ id, status, required_level: level }, { status: 201 });
};
