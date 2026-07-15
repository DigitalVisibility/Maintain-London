/**
 * The variations register.
 *
 * A variation is a change to the contract — "replace the rotten rafters we found
 * once the roof was open". Each one is numbered per project, carries net / VAT /
 * total, and runs Draft → Pending → Approved / Rejected. Only *approved*
 * variations change what the client owes, which is why the status here is the
 * thing Phase 4's valuation reads.
 *
 * Raising a variation for sign-off goes through the same approval engine as any
 * other additional-works request (lib/approvals.ts), so the client gets the same
 * one-tap email and the decision flows back onto the register.
 */

import { queryAll, queryOne, execute, generateId, now } from './db';
import { raiseApproval, type ApprovalProject } from './approvals';
import { sendEmail, emailLayout, loadSender } from './email';
import { baseUrlForOrgId } from './platform';

export type VariationStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface Variation {
  id: string;
  org_id: string | null;
  project_id: string;
  number: number;
  description: string;
  net: number;
  vat_rate: number;
  vat: number;
  total: number;
  status: VariationStatus;
  source_entry_id: string | null;
  source_variation_id: string | null;
  approval_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  raised_at: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface VariationEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  BETTER_AUTH_URL?: string;
}

/** net + VAT = total. Rounded to the penny so stored figures always reconcile. */
export function computeMoney(net: number, vatRate: number): { net: number; vat: number; total: number } {
  const n = Math.round((Number(net) || 0) * 100) / 100;
  const rate = Number(vatRate) || 0;
  const vat = Math.round(n * rate) / 100;      // n * (rate/100), rounded to pennies
  const total = Math.round((n + vat) * 100) / 100;
  return { net: n, vat, total };
}

/** Display form of the sequential number: 0001, 0042, … */
export function formatNumber(n: number): string {
  return String(n).padStart(4, '0');
}

/** The next register number for a project (sequential, never reused). */
async function nextNumber(db: D1Database, projectId: string): Promise<number> {
  const row = await queryOne<{ max_n: number | null }>(
    db, 'SELECT MAX(number) AS max_n FROM variations WHERE project_id = ?', [projectId]
  );
  return (row?.max_n ?? 0) + 1;
}

export interface CreateVariationInput {
  orgId: string | null;
  projectId: string;
  description: string;
  net?: number;
  vatRate?: number;
  createdBy?: string | null;
  createdByName?: string | null;
  sourceEntryId?: string | null;
  sourceVariationId?: string | null;
}

/** Create a draft register entry. */
export async function createVariation(db: D1Database, input: CreateVariationInput): Promise<Variation> {
  const number = await nextNumber(db, input.projectId);
  const money = computeMoney(input.net ?? 0, input.vatRate ?? 20);
  const id = generateId();
  const timestamp = now();

  await execute(
    db,
    `INSERT INTO variations
       (id, org_id, project_id, number, description, net, vat_rate, vat, total, status,
        source_entry_id, source_variation_id, created_by, created_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    [
      id, input.orgId, input.projectId, number, input.description.trim(),
      money.net, input.vatRate ?? 20, money.vat, money.total,
      input.sourceEntryId ?? null, input.sourceVariationId ?? null,
      input.createdBy ?? null, input.createdByName ?? null, timestamp, timestamp,
    ]
  );

  return (await queryOne<Variation>(db, 'SELECT * FROM variations WHERE id = ?', [id]))!;
}

/** Edit a draft's description / net / VAT rate, keeping the money reconciled. */
export async function updateVariation(
  db: D1Database,
  variation: Variation,
  patch: { description?: string; net?: number; vat_rate?: number }
): Promise<void> {
  const net = patch.net ?? variation.net;
  const rate = patch.vat_rate ?? variation.vat_rate;
  const money = computeMoney(net, rate);

  await execute(
    db,
    `UPDATE variations
        SET description = ?, net = ?, vat_rate = ?, vat = ?, total = ?, updated_at = ?
      WHERE id = ?`,
    [
      patch.description?.trim() ?? variation.description,
      money.net, rate, money.vat, money.total, now(), variation.id,
    ]
  );
}

/**
 * Raise a variation for sign-off. Creates an approval through the shared engine —
 * so the client (or a manager, if the project follows the spend tiers) gets the
 * one-tap decide link — and moves the register entry to Pending, or straight to
 * Approved if it auto-approved under the spend tiers.
 */
export async function raiseVariation(
  env: VariationEnv,
  variation: Variation,
  project: ApprovalProject & { variation_approval?: string | null },
  requester: { id: string; name?: string | null }
): Promise<{ status: VariationStatus }> {
  // A variation always reaches the client, unless the project is set to follow
  // the operational spend tiers instead.
  const forceLevel = project.variation_approval === 'tiered' ? undefined : ('client' as const);

  const approval = await raiseApproval(env, {
    project,
    type: 'variation',
    description: `Variation ${formatNumber(variation.number)}: ${variation.description}`,
    cost: variation.total,
    requestedBy: requester.id,
    requestedByName: requester.name ?? null,
    variationId: variation.id,
    forceLevel,
  });

  // Auto-approved under the tiers → approved now; otherwise awaiting a decision.
  const status: VariationStatus = approval.status === 'auto_approved' ? 'approved' : 'pending';
  const timestamp = now();

  await execute(
    env.DB,
    `UPDATE variations
        SET status = ?, approval_id = ?, raised_at = ?,
            decided_at = ?, decided_by_name = ?, updated_at = ?
      WHERE id = ?`,
    [
      status, approval.id, timestamp,
      status === 'approved' ? timestamp : null,
      status === 'approved' ? 'Auto-approved (within limit)' : null,
      timestamp, variation.id,
    ]
  );

  return { status };
}

export interface RegisterSummary {
  approved: { count: number; net: number; vat: number; total: number };
  pending: { count: number; net: number; vat: number; total: number };
  draft: { count: number };
  rejected: { count: number };
}

/**
 * Totals for a project's register. The *approved* net is the number Phase 4
 * adds to the quote to get the revised contract sum — pending and draft ones are
 * shown for visibility but do not yet count.
 */
export async function registerSummary(db: D1Database, projectId: string): Promise<RegisterSummary> {
  const rows = await queryAll<{ status: string; n: number; net: number; vat: number; total: number }>(
    db,
    `SELECT status, COUNT(*) AS n,
            COALESCE(SUM(net), 0) AS net, COALESCE(SUM(vat), 0) AS vat, COALESCE(SUM(total), 0) AS total
       FROM variations WHERE project_id = ? GROUP BY status`,
    [projectId]
  );

  const zero = { count: 0, net: 0, vat: 0, total: 0 };
  const summary: RegisterSummary = {
    approved: { ...zero }, pending: { ...zero }, draft: { count: 0 }, rejected: { count: 0 },
  };
  for (const r of rows) {
    if (r.status === 'approved') summary.approved = { count: r.n, net: r.net, vat: r.vat, total: r.total };
    else if (r.status === 'pending') summary.pending = { count: r.n, net: r.net, vat: r.vat, total: r.total };
    else if (r.status === 'draft') summary.draft.count = r.n;
    else if (r.status === 'rejected') summary.rejected.count = r.n;
  }
  return summary;
}

/**
 * Promote the variation lines on a saved diary entry into draft register entries.
 *
 * Runs on every diary save, so it must be idempotent: each diary line carries a
 * stable id (kept across saves — see lib/diary-children.ts), and a unique index
 * on source_variation_id means a line is only ever promoted once. New, priced-up
 * work then happens in the register, where the office owns it.
 */
export async function syncDiaryVariations(
  env: VariationEnv,
  entry: { id: string; project_id: string; org_id?: string | null },
  variations: { id?: string; description?: string }[],
  actor: { id?: string | null; name?: string | null }
): Promise<number> {
  let created = 0;
  const drafted: { number: number; description: string }[] = [];

  for (const v of variations) {
    if (!v.id || !v.description?.trim()) continue;

    const existing = await queryOne<{ id: string }>(
      env.DB, 'SELECT id FROM variations WHERE source_variation_id = ?', [v.id]
    );
    if (existing) continue;

    const variation = await createVariation(env.DB, {
      orgId: entry.org_id ?? null,
      projectId: entry.project_id,
      description: v.description.trim(),
      createdBy: actor.id ?? null,
      createdByName: actor.name ?? null,
      sourceEntryId: entry.id,
      sourceVariationId: v.id,
    });
    drafted.push({ number: variation.number, description: variation.description });
    created++;
  }

  if (drafted.length > 0) {
    await notifyVariationsDrafted(env, entry.project_id, drafted);
  }
  return created;
}

/** Tell the office a variation was noted on site and needs pricing. Never throws. */
async function notifyVariationsDrafted(
  env: VariationEnv,
  projectId: string,
  drafted: { number: number; description: string }[]
): Promise<void> {
  try {
    const project = await queryOne<{ name: string; org_id: string | null }>(
      env.DB, 'SELECT name, org_id FROM projects WHERE id = ?', [projectId]
    );
    if (!project) return;

    const staff = await queryAll<{ email: string }>(
      env.DB,
      `SELECT u.email FROM memberships m JOIN user u ON u.id = m.user_id
        WHERE m.org_id = ? AND m.role IN ('owner','admin','manager')`,
      [project.org_id ?? '']
    );
    const recipients = staff.map((s) => s.email).filter(Boolean);
    if (recipients.length === 0) return;

    const base = await baseUrlForOrgId(env, env.DB, project.org_id);
    const sender = await loadSender(env.DB, project.org_id);
    const list = drafted
      .map((d) => `<li><strong>${formatNumber(d.number)}</strong> — ${escapeHtml(d.description)}</li>`)
      .join('');

    await sendEmail(env.RESEND_API_KEY, {
      to: recipients,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: `Variation noted on site — ${project.name}`,
      html: emailLayout({
        sender,
        heading: `A variation needs pricing — ${project.name}`,
        body: `<p>A variation was recorded on the site diary and added to the register as a draft:</p>
               <ul>${list}</ul>
               <p>Add the cost, reword if needed, then raise it to the client for approval.</p>`,
        ctaLabel: 'Open the register',
        ctaUrl: `${base}/project-hub/project/${projectId}`,
      }),
    });
  } catch (err) {
    console.error('notifyVariationsDrafted failed', err);
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The register as CSV — one row per variation, ready for any accounting package. */
export function toCSV(variations: Variation[]): string {
  const header = ['Number', 'Description', 'Status', 'Net', 'VAT rate %', 'VAT', 'Total', 'Raised', 'Decided'];
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = variations.map((v) => [
    formatNumber(v.number),
    v.description,
    v.status,
    v.net.toFixed(2),
    String(v.vat_rate),
    v.vat.toFixed(2),
    v.total.toFixed(2),
    v.raised_at ?? '',
    v.decided_at ?? '',
  ].map(cell).join(','));
  return [header.join(','), ...rows].join('\r\n');
}
