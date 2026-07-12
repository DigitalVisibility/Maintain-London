import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { can, hasCap } from '../../../lib/capabilities';
import { canAccessProject } from '../../../lib/access';
import { sendEmail, emailLayout, loadSender } from '../../../lib/email';

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

  const cost = typeof body.est_cost === 'number' ? body.est_cost : null;
  const autoLimit = project.approval_auto_limit ?? 150;
  const mgrLimit = project.approval_manager_limit ?? 750;

  // Decide the tier.
  let level: 'auto' | 'manager' | 'client' | 'emergency';
  let status: 'auto_approved' | 'pending' | 'emergency';
  if (body.is_emergency) {
    level = 'emergency'; status = 'emergency';
  } else if (cost !== null && cost <= autoLimit) {
    level = 'auto'; status = 'auto_approved';
  } else if (cost !== null && cost <= mgrLimit) {
    level = 'manager'; status = 'pending';
  } else {
    level = 'client'; status = 'pending';
  }

  const id = generateId();
  const decideToken = generateId() + generateId();
  const timestamp = now();

  await execute(
    env.DB,
    `INSERT INTO approval_requests
       (id, org_id, project_id, entry_id, type, description, est_cost, photo_key,
        requested_by, requested_by_name, required_level, status, is_emergency, reason,
        decide_token, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, orgId, body.project_id, null, body.type ?? 'additional_work', body.description.trim(),
      cost, body.photo_key ?? null, user.id, user.name ?? null, level, status,
      body.is_emergency ? 1 : 0, body.reason ?? null, decideToken, timestamp,
    ]
  );

  // Notify the right people.
  await notify(env, project, {
    level, status, description: body.description.trim(), cost, requester: user.name ?? 'A team member',
    isEmergency: !!body.is_emergency, decideToken,
  });

  return Response.json({ id, status, required_level: level }, { status: 201 });
};

/** Email the appropriate approvers (managers for manager-level, clients for client-level). */
async function notify(env: any, project: ProjectRow, info: {
  level: string; status: string; description: string; cost: number | null;
  requester: string; isEmergency: boolean; decideToken: string;
}) {
  const base = env.BETTER_AUTH_URL || 'https://maintainlondon.co.uk';
  const decideUrl = `${base}/project-hub/approve?token=${encodeURIComponent(info.decideToken)}`;
  const costStr = info.cost !== null ? `£${info.cost.toFixed(2)}` : 'cost TBC';

  // Recipients depend on the tier.
  let recipients: string[] = [];
  if (info.level === 'manager') {
    const rows = await queryAll<{ email: string }>(
      env.DB,
      `SELECT u.email FROM memberships m JOIN user u ON u.id = m.user_id
        WHERE m.org_id = ? AND m.role IN ('owner','admin','manager')`,
      [project.org_id]
    );
    recipients = rows.map((r) => r.email);
  } else if (info.level === 'client') {
    const rows = await queryAll<{ email: string }>(
      env.DB,
      `SELECT u.email FROM project_clients pc JOIN user u ON u.id = pc.user_id WHERE pc.project_id = ?`,
      [project.id]
    );
    recipients = rows.map((r) => r.email);
  } else if (info.isEmergency) {
    // Everyone with a stake: managers + clients.
    const rows = await queryAll<{ email: string }>(
      env.DB,
      `SELECT u.email FROM memberships m JOIN user u ON u.id = m.user_id
        WHERE m.org_id = ? AND m.role IN ('owner','admin','manager')
       UNION
       SELECT u.email FROM project_clients pc JOIN user u ON u.id = pc.user_id WHERE pc.project_id = ?`,
      [project.org_id, project.id]
    );
    recipients = rows.map((r) => r.email);
  }
  if (recipients.length === 0) return;

  const heading = info.isEmergency
    ? `⚠️ Emergency works started on ${project.name}`
    : `Approval needed: ${project.name}`;
  const bodyHtml = info.isEmergency
    ? `<p><strong>${info.requester}</strong> has started emergency / make-safe works on <strong>${project.name}</strong> (${costStr}).</p>
       <p>${info.description}</p>
       <p>This is for your awareness — the work is already underway. Please review and acknowledge.</p>`
    : `<p><strong>${info.requester}</strong> has requested approval for additional works on <strong>${project.name}</strong> (${costStr}).</p>
       <p>${info.description}</p>
       <p>Tap below to approve or decline — no login needed.</p>`;

  // Goes out as the business that owns the project, not as the platform.
  const sender = await loadSender(env.DB, project.org_id);

  await sendEmail(env.RESEND_API_KEY, {
    to: recipients,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: heading,
    html: emailLayout({
      sender,
      heading,
      body: bodyHtml,
      ctaLabel: info.isEmergency ? 'Review' : 'Approve / Decline',
      ctaUrl: decideUrl,
    }),
  });
}
