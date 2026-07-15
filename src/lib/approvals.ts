/**
 * The additional-works / variation approval engine.
 *
 * One place decides the tier, writes the request, and emails the right people
 * with a one-tap decide link — used by the approvals route *and* the variations
 * register, so a variation raised for sign-off goes through exactly the same
 * flow (and the same emailed magic link) as any other additional-works request.
 */

import { queryAll, execute, generateId, now } from './db';
import { sendEmail, emailLayout, loadSender } from './email';
import { baseUrlForOrgId } from './platform';

export interface ApprovalProject {
  id: string;
  org_id: string;
  name: string;
  approval_auto_limit?: number | null;
  approval_manager_limit?: number | null;
}

export type ApprovalLevel = 'auto' | 'manager' | 'client' | 'emergency';
export type ApprovalStatus = 'auto_approved' | 'pending' | 'emergency';

export interface RaiseApprovalInput {
  project: ApprovalProject;
  type?: string;               // additional_work | extra_materials | variation | other
  description: string;
  cost?: number | null;
  requestedBy?: string | null;
  requestedByName?: string | null;
  isEmergency?: boolean;
  reason?: string | null;
  photoKey?: string | null;
  entryId?: string | null;
  variationId?: string | null;
  /**
   * Force a tier regardless of cost. Variations use this: a change to the
   * contract sum should reach the client whatever it costs, unless the project
   * is explicitly set to follow the spend tiers.
   */
  forceLevel?: ApprovalLevel;
}

export interface RaisedApproval {
  id: string;
  status: ApprovalStatus;
  level: ApprovalLevel;
  decideToken: string;
}

export interface ApprovalEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  BETTER_AUTH_URL?: string;
}

/** Decide which tier a request falls into, from cost and the project's limits. */
export function tierFor(
  project: ApprovalProject,
  cost: number | null,
  isEmergency: boolean,
  forceLevel?: ApprovalLevel
): { level: ApprovalLevel; status: ApprovalStatus } {
  if (isEmergency) return { level: 'emergency', status: 'emergency' };
  if (forceLevel) {
    // A forced client/manager tier still needs a decision; only 'auto' approves.
    return { level: forceLevel, status: forceLevel === 'auto' ? 'auto_approved' : 'pending' };
  }

  const autoLimit = project.approval_auto_limit ?? 150;
  const mgrLimit = project.approval_manager_limit ?? 750;

  if (cost !== null && cost <= autoLimit) return { level: 'auto', status: 'auto_approved' };
  if (cost !== null && cost <= mgrLimit) return { level: 'manager', status: 'pending' };
  return { level: 'client', status: 'pending' };
}

/** Create an approval request, persist it, and notify the right people. */
export async function raiseApproval(env: ApprovalEnv, input: RaiseApprovalInput): Promise<RaisedApproval> {
  const cost = typeof input.cost === 'number' ? input.cost : null;
  const { level, status } = tierFor(input.project, cost, !!input.isEmergency, input.forceLevel);

  const id = generateId();
  const decideToken = generateId() + generateId();
  const timestamp = now();

  await execute(
    env.DB,
    `INSERT INTO approval_requests
       (id, org_id, project_id, entry_id, type, description, est_cost, photo_key,
        requested_by, requested_by_name, required_level, status, is_emergency, reason,
        decide_token, variation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.project.org_id, input.project.id, input.entryId ?? null,
      input.type ?? 'additional_work', input.description.trim(), cost, input.photoKey ?? null,
      input.requestedBy ?? null, input.requestedByName ?? null, level, status,
      input.isEmergency ? 1 : 0, input.reason ?? null, decideToken, input.variationId ?? null,
      timestamp,
    ]
  );

  await notifyApprovers(env, input.project, {
    level, status, description: input.description.trim(), cost,
    requester: input.requestedByName ?? 'A team member',
    isEmergency: !!input.isEmergency, decideToken,
  });

  return { id, status, level, decideToken };
}

interface NotifyInfo {
  level: ApprovalLevel | string;
  status: string;
  description: string;
  cost: number | null;
  requester: string;
  isEmergency: boolean;
  decideToken: string;
}

/** Email the appropriate approvers (managers for manager-level, the client for client-level). */
export async function notifyApprovers(env: ApprovalEnv, project: ApprovalProject, info: NotifyInfo): Promise<void> {
  const base = await baseUrlForOrgId(env, env.DB, project.org_id);
  const decideUrl = `${base}/project-hub/approve?token=${encodeURIComponent(info.decideToken)}`;
  const costStr = info.cost !== null ? `£${info.cost.toFixed(2)}` : 'cost TBC';

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

/**
 * When an approval that was raised by a variation is decided, mirror the outcome
 * onto the register. Called from both decision paths (in-app and one-tap link).
 */
export async function syncVariationFromApproval(
  db: D1Database,
  approval: { id: string; variation_id?: string | null; status: string },
  approverName: string | null
): Promise<void> {
  if (!approval.variation_id) return;

  const variationStatus =
    approval.status === 'rejected' ? 'rejected'
    : (approval.status === 'approved' || approval.status === 'auto_approved') ? 'approved'
    : null;
  if (!variationStatus) return;

  await execute(
    db,
    `UPDATE variations
        SET status = ?, decided_at = ?, decided_by_name = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'`,
    [variationStatus, now(), approverName, now(), approval.variation_id]
  );
}
