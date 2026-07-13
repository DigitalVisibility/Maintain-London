/**
 * Interim valuations and client invoices.
 *
 * The whole thing is derived from three stored inputs — the quote, the % complete,
 * and the invoices marked paid — plus the approved variations from Phase 3's
 * register. Keeping it computed means the figures can never drift out of step
 * with the register or the payments; there is no second copy to go stale.
 *
 * The model is the one on the invoice-summary sketch, and computeValuation is
 * unit-tested against those exact numbers:
 *   revised contract sum = quote + approved variations
 *   value of work done   = % complete × revised contract sum
 *   next instalment due  = value of work done − paid to date
 *   balance outstanding  = revised contract sum − paid to date
 */

import { queryAll, queryOne, execute, generateId, now } from './db';
import { registerSummary } from './variations';

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface Invoice {
  id: string;
  org_id: string | null;
  project_id: string;
  number: number;
  description: string;
  net: number;
  vat_rate: number;
  vat: number;
  total: number;
  status: InvoiceStatus;
  is_deposit: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** A net / VAT / total triple — every figure in a valuation is one of these. */
export interface Money {
  net: number;
  vat: number;
  total: number;
}

function money(net: number, vat: number): Money {
  const n = round(net);
  const v = round(vat);
  return { net: n, vat: v, total: round(n + v) };
}

/** Round to the penny. Money is only ever added/subtracted/scaled here, so
 *  rounding once at construction keeps every stored and shown figure reconciled. */
function round(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface ValuationInputs {
  quotedNet: number;
  quotedVatRate: number;
  /** Approved variations, already summed (net + vat) from the register. */
  variationsNet: number;
  variationsVat: number;
  percentComplete: number;   // 0–100
  /** Sum of paid invoices. */
  paidNet: number;
  paidVat: number;
}

export interface Valuation {
  quoted: Money;
  variations: Money;
  revised: Money;
  percentComplete: number;
  valueComplete: Money;
  paidToDate: Money;
  nextInstalment: Money;
  balanceOutstanding: Money;
  balanceAfterInstalment: Money;
}

/**
 * The full interim valuation. Pure — give it the numbers, get the position back.
 *
 * VAT on the variations is summed from the register rather than re-derived, so a
 * mix of 20% / 5% / 0% variations values correctly; VAT on the quote uses the
 * project's quoted rate. Value-complete scales the whole revised sum (net and
 * VAT alike) by the percentage, which is what the sketch does.
 */
export function computeValuation(inp: ValuationInputs): Valuation {
  const quoted = money(inp.quotedNet, (inp.quotedNet * (inp.quotedVatRate || 0)) / 100);
  const variations = money(inp.variationsNet, inp.variationsVat);
  const revised = money(quoted.net + variations.net, quoted.vat + variations.vat);

  const pct = Math.min(100, Math.max(0, Number(inp.percentComplete) || 0)) / 100;
  const valueComplete = money(revised.net * pct, revised.vat * pct);

  const paidToDate = money(inp.paidNet, inp.paidVat);

  // Never negative: if the client has paid ahead of the work done, the next
  // instalment is simply nil rather than a credit.
  const nextInstalment = money(
    Math.max(0, valueComplete.net - paidToDate.net),
    Math.max(0, valueComplete.vat - paidToDate.vat)
  );

  const balanceOutstanding = money(revised.net - paidToDate.net, revised.vat - paidToDate.vat);
  const balanceAfterInstalment = money(
    revised.net - paidToDate.net - nextInstalment.net,
    revised.vat - paidToDate.vat - nextInstalment.vat
  );

  return {
    quoted, variations, revised,
    percentComplete: Math.min(100, Math.max(0, Number(inp.percentComplete) || 0)),
    valueComplete, paidToDate, nextInstalment, balanceOutstanding, balanceAfterInstalment,
  };
}

export interface ProjectFinancials {
  id: string;
  org_id: string | null;
  quoted_net: number;
  quoted_vat_rate: number;
  percent_complete: number;
}

/** Load the inputs and compute the valuation for a project. */
export async function valuationFor(db: D1Database, project: ProjectFinancials): Promise<Valuation> {
  const variations = await registerSummary(db, project.id);
  const paid = await queryOne<{ net: number; vat: number }>(
    db,
    `SELECT COALESCE(SUM(net),0) AS net, COALESCE(SUM(vat),0) AS vat
       FROM invoices WHERE project_id = ? AND status = 'paid'`,
    [project.id]
  );

  return computeValuation({
    quotedNet: project.quoted_net,
    quotedVatRate: project.quoted_vat_rate,
    variationsNet: variations.approved.net,
    variationsVat: variations.approved.vat,
    percentComplete: project.percent_complete,
    paidNet: paid?.net ?? 0,
    paidVat: paid?.vat ?? 0,
  });
}

// ── Invoices ────────────────────────────────────────────────────────────────

export function computeInvoiceMoney(net: number, vatRate: number): Money {
  const n = round(net);
  return money(n, (n * (Number(vatRate) || 0)) / 100);
}

/**
 * The next invoice number for a business. Sequential per org, and respecting the
 * org's seed number so a business can align it with the books they already keep.
 */
async function nextInvoiceNumber(db: D1Database, orgId: string | null): Promise<number> {
  const org = await queryOne<{ invoice_next_number: number }>(
    db, 'SELECT invoice_next_number FROM organisations WHERE id = ?', [orgId ?? '']
  );
  const seed = org?.invoice_next_number ?? 1;
  const max = await queryOne<{ max_n: number | null }>(
    db, 'SELECT MAX(number) AS max_n FROM invoices WHERE org_id = ?', [orgId ?? '']
  );
  // Never reuse a number even if the seed was set below what's already issued.
  const number = Math.max(seed, (max?.max_n ?? 0) + 1);
  await execute(
    db, 'UPDATE organisations SET invoice_next_number = ? WHERE id = ?', [number + 1, orgId ?? '']
  );
  return number;
}

export interface CreateInvoiceInput {
  orgId: string | null;
  projectId: string;
  description: string;
  net: number;
  vatRate: number;
  isDeposit?: boolean;
  status?: InvoiceStatus;
  dueAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
}

export async function createInvoice(db: D1Database, input: CreateInvoiceInput): Promise<Invoice> {
  const number = await nextInvoiceNumber(db, input.orgId);
  const m = computeInvoiceMoney(input.net, input.vatRate);
  const id = generateId();
  const timestamp = now();
  const status = input.status ?? 'draft';

  await execute(
    db,
    `INSERT INTO invoices
       (id, org_id, project_id, number, description, net, vat_rate, vat, total,
        status, is_deposit, issued_at, due_at, created_by, created_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.orgId, input.projectId, number, input.description.trim(),
      m.net, input.vatRate, m.vat, m.total,
      status, input.isDeposit ? 1 : 0,
      status !== 'draft' ? timestamp : null, input.dueAt ?? null,
      input.createdBy ?? null, input.createdByName ?? null, timestamp, timestamp,
    ]
  );

  return (await queryOne<Invoice>(db, 'SELECT * FROM invoices WHERE id = ?', [id]))!;
}

export function listInvoices(db: D1Database, projectId: string): Promise<Invoice[]> {
  return queryAll<Invoice>(db, 'SELECT * FROM invoices WHERE project_id = ? ORDER BY number', [projectId]);
}

export interface InvoicesSummary {
  paid: { count: number; total: number };
  outstanding: { count: number; total: number };  // sent but not paid
  draft: { count: number };
}

/** Paid vs pending, for the client's "invoices" card. */
export async function invoicesSummary(db: D1Database, projectId: string): Promise<InvoicesSummary> {
  const rows = await queryAll<{ status: string; n: number; total: number }>(
    db,
    `SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS total
       FROM invoices WHERE project_id = ? GROUP BY status`,
    [projectId]
  );
  const s: InvoicesSummary = { paid: { count: 0, total: 0 }, outstanding: { count: 0, total: 0 }, draft: { count: 0 } };
  for (const r of rows) {
    if (r.status === 'paid') s.paid = { count: r.n, total: r.total };
    else if (r.status === 'sent') s.outstanding = { count: r.n, total: r.total };
    else if (r.status === 'draft') s.draft.count = r.n;
  }
  return s;
}
