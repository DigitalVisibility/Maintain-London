/**
 * Quotes — the pre-project object.
 *
 * Everything else on this platform starts at a project, i.e. at a job already
 * won. A builder walking round a job they are *pricing* had nowhere to put
 * anything. A quote is that home: walk the site, shoot and talk, get a sectioned
 * scope back, price it. On acceptance the quote graduates into a project and its
 * accepted net becomes that project's quoted sum, so the valuation in
 * lib/financials.ts reads the very figure the client signed rather than a second
 * number somebody re-keyed.
 *
 * Money here follows the same rule as the rest of the codebase: computed, never
 * stored as a total. There is no totals column to drift out of step with the lines.
 */

import { queryAll, queryOne, execute, generateId, now } from './db';
import { geocodePostcode } from './geocode';
import { hasCap } from './capabilities';
import type { Quote, QuoteItem, QuoteFile, QuoteFull, QuoteStatus, QuoteTotals, VoiceNote } from '../types/diary';

// ── Money ───────────────────────────────────────────────────────────────────

/**
 * Pounds → whole pence.
 *
 * Every sum below happens in integer pence and converts back once at the end.
 * Adding pounds as floats drifts (0.1 + 0.2 is famously not 0.3), and a quote
 * total is a figure a client signs and a builder is held to — a penny out on a
 * forty-line quote is a real argument, not a rounding curiosity.
 */
function toPence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

const toPounds = (pence: number): number => Math.round(pence) / 100;

/**
 * One line's net, in pence.
 *
 * qty × rate when the estimator has given both; otherwise the explicit net they
 * typed. A line drafted from a walkthrough usually has neither — it is scope
 * awaiting a price — and contributes nothing until someone prices it.
 */
export function lineNetPence(item: Pick<QuoteItem, 'qty' | 'rate' | 'net'>): number {
  const hasQty = item.qty !== null && item.qty !== undefined && Number.isFinite(Number(item.qty));
  const hasRate = item.rate !== null && item.rate !== undefined && Number.isFinite(Number(item.rate));
  if (hasQty && hasRate) {
    // Multiply in pounds and round once — qty is often fractional (3.5 m², 0.5
    // day) and rounding either factor first would lose the half.
    return Math.round(Number(item.qty) * Number(item.rate) * 100);
  }
  return toPence(item.net);
}

/** One line's net in pounds, as shown on screen and written to the row. */
export function lineNet(item: Pick<QuoteItem, 'qty' | 'rate' | 'net'>): number {
  return toPounds(lineNetPence(item));
}

/**
 * A quote's totals. Pure, and the single definition used by the API, the builder
 * UI and the conversion to a project, so all three can never disagree.
 */
export function computeTotals(items: QuoteItem[], vatRate: number): QuoteTotals {
  let netPence = 0;
  let provisionalPence = 0;

  for (const item of items ?? []) {
    const linePence = lineNetPence(item);
    netPence += linePence;
    if (item.provisional) provisionalPence += linePence;
  }

  const rate = Number.isFinite(Number(vatRate)) ? Number(vatRate) : 0;
  // VAT on the quote as a whole, not per line: rounding each line's VAT and
  // summing gives a figure that does not match net × rate on the printed page.
  const vatPence = Math.round((netPence * rate) / 100);

  return {
    net: toPounds(netPence),
    vat: toPounds(vatPence),
    total: toPounds(netPence + vatPence),
    provisional_net: toPounds(provisionalPence),
  };
}

// ── Numbering ───────────────────────────────────────────────────────────────

/** Display form of the sequential number: Q0001, Q0042, … */
export function formatQuoteNumber(n: number): string {
  return `Q${String(n).padStart(4, '0')}`;
}

/**
 * The next quote number for a business — sequential per org, never reused.
 *
 * Same shape as the variations register's numbering (MAX + 1), read back off the
 * stored numbers so there is no separate counter to fall out of step. The number
 * is TEXT (Q0001), so the max is taken over the numeric part; anything not in the
 * Q-prefixed form is ignored rather than allowed to corrupt the sequence.
 *
 * Two people creating a quote in the same second would both read the same max.
 * The unique index on (org_id, number) turns that into an insert failure rather
 * than a duplicate, and createQuote below retries — see the note there.
 */
export async function nextQuoteNumber(db: D1Database, orgId: string): Promise<string> {
  const row = await queryOne<{ max_n: number | null }>(
    db,
    `SELECT MAX(CAST(SUBSTR(number, 2) AS INTEGER)) AS max_n
       FROM quotes
      WHERE org_id = ? AND number LIKE 'Q%'`,
    [orgId]
  );
  return formatQuoteNumber((row?.max_n ?? 0) + 1);
}

// ── Loading ─────────────────────────────────────────────────────────────────

/** The quote row on its own. Callers authorise from this row's own org_id. */
export function loadQuoteRow(db: D1Database, id: string): Promise<Quote | null> {
  return queryOne<Quote>(db, 'SELECT * FROM quotes WHERE id = ?', [id]);
}

/**
 * A quote with its lines, its walkthrough photos and the voice notes recorded
 * against it. Transcribed notes only: a pending or failed one has no words in it
 * yet, and listing it as source material would suggest the scope was drafted
 * from something it never saw.
 */
export async function loadQuote(db: D1Database, id: string): Promise<QuoteFull | null> {
  const quote = await loadQuoteRow(db, id);
  if (!quote) return null;

  const [items, files, voiceNotes] = await Promise.all([
    queryAll<QuoteItem>(
      db, 'SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order, created_at', [id]
    ),
    queryAll<QuoteFile>(
      db, 'SELECT * FROM quote_files WHERE quote_id = ? ORDER BY created_at', [id]
    ),
    queryAll<VoiceNote>(
      db,
      `SELECT * FROM voice_notes
        WHERE quote_id = ? AND status = 'transcribed'
        ORDER BY created_at`,
      [id]
    ),
  ]);

  return { ...quote, items, files, voice_notes: voiceNotes };
}

/** Every transcript recorded on a walkthrough, oldest first, blanks dropped. */
export async function loadTranscripts(db: D1Database, quoteId: string): Promise<string[]> {
  const notes = await queryAll<{ transcript: string | null }>(
    db,
    `SELECT transcript FROM voice_notes
      WHERE quote_id = ? AND status = 'transcribed' AND transcript IS NOT NULL
      ORDER BY created_at`,
    [quoteId]
  );
  return notes.map((n) => (n.transcript ?? '').trim()).filter(Boolean);
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * The transitions a quote may make.
 *
 * Reverting sent → draft is deliberate: a builder who spots a mistake in a quote
 * they have just emailed needs to pull it back and re-issue, and refusing that
 * only teaches them to delete the quote and start again, losing the history.
 * Everything else is refused loudly. An accepted quote is frozen — it is the
 * document the client agreed to, and a project hangs off it.
 */
const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'draft'],
  accepted: [],
  declined: [],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/** Throw with something the estimator can read, rather than silently allowing it. */
export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (canTransition(from, to)) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  throw new Error(
    allowed.length
      ? `A ${from} quote cannot be marked ${to}. From ${from} it can only go to: ${allowed.join(', ')}.`
      : `A ${from} quote is final and cannot be changed to ${to}.`
  );
}

export const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined'];

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === 'string' && (QUOTE_STATUSES as string[]).includes(value);
}

// ── Authorisation ───────────────────────────────────────────────────────────

/** Locals as far as a quote route needs them. */
export interface QuoteLocals {
  user?: { id: string } | null;
  role?: string | null;
  org?: { id: string } | null;
  capabilities?: string[];
}

/**
 * Load a quote and decide, from the row itself, whether this caller may touch it.
 *
 * The order is the point. The row is fetched first and the org comparison is made
 * against the *stored* org_id — never against an org id, project id or any other
 * scope the caller supplied. This repo has previously shipped a cross-tenant leak
 * from authorising a caller's claim about a record rather than the record, and
 * every quote route goes through this one function so it cannot happen twice.
 *
 * A quote is commercially sensitive before a job is won: what a business charges,
 * who it is bidding against, which jobs it is chasing. `manage_quotes` is held by
 * owners, admins and managers; operatives and clients never see this at all.
 */
export async function authoriseQuote(
  db: D1Database,
  locals: QuoteLocals,
  quoteId: string | null | undefined
): Promise<
  | { ok: true; quote: Quote }
  | { ok: false; response: Response }
> {
  const unauthorised = { ok: false as const, response: new Response('Unauthorized', { status: 401 }) };
  const forbidden = { ok: false as const, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  const notFound = { ok: false as const, response: Response.json({ error: 'Quote not found' }, { status: 404 }) };

  if (!locals.user) return unauthorised;
  if (!locals.org) return forbidden;
  if (!hasCap(locals, 'manage_quotes')) return forbidden;
  if (!quoteId) return { ok: false, response: Response.json({ error: 'Quote id is required' }, { status: 400 }) };

  const quote = await loadQuoteRow(db, quoteId);
  if (!quote) return notFound;

  // Authorised from the row's own org_id, not from anything the caller sent.
  if (quote.org_id !== locals.org.id) {
    // Deliberately a 404, not a 403: confirming that a quote id exists in some
    // other business is itself a small leak.
    return notFound;
  }

  return { ok: true, quote };
}

/** The same gate for routes that have no quote yet (list, create). */
export function authoriseQuotes(locals: QuoteLocals): { ok: true; orgId: string } | { ok: false; response: Response } {
  if (!locals.user) return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  if (!locals.org || !hasCap(locals, 'manage_quotes')) {
    return { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, orgId: locals.org.id };
}

// ── Creating ────────────────────────────────────────────────────────────────

export interface CreateQuoteInput {
  orgId: string;
  title: string;
  clientName?: string | null;
  clientEmail?: string | null;
  address?: string | null;
  postcode?: string | null;
  vatRate?: number;
  notes?: string | null;
  createdBy: string;
}

/**
 * Mint a draft quote.
 *
 * The retry exists because the number is derived from MAX rather than a locked
 * counter: two estimators starting a quote at the same moment both read Q0007,
 * and the unique index on (org_id, number) rejects the loser. Re-reading the max
 * and trying again is cheaper and safer than serialising every create.
 */
export async function createQuote(db: D1Database, input: CreateQuoteInput): Promise<Quote> {
  const id = generateId();
  const timestamp = now();
  const vatRate = Number.isFinite(Number(input.vatRate)) ? Number(input.vatRate) : 20;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = await nextQuoteNumber(db, input.orgId);
    try {
      await execute(
        db,
        `INSERT INTO quotes
           (id, org_id, number, title, client_name, client_email, address, postcode,
            status, vat_rate, notes, assumptions, project_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, NULL, ?, ?, ?)`,
        [
          id, input.orgId, number, input.title.trim(),
          input.clientName?.trim() || null, input.clientEmail?.trim() || null,
          input.address?.trim() || null, input.postcode?.trim() || null,
          vatRate, input.notes?.trim() || null,
          input.createdBy, timestamp, timestamp,
        ]
      );
      return (await loadQuoteRow(db, id))!;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      // Only a number collision is worth retrying; anything else is a real fault.
      if (!/UNIQUE|constraint/i.test(message)) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not allocate a quote number');
}

// ── Items ───────────────────────────────────────────────────────────────────

/** Shape of a line as the builder UI posts it back. */
export interface IncomingItem {
  id?: unknown;
  section?: unknown;
  description?: unknown;
  qty?: unknown;
  unit?: unknown;
  rate?: unknown;
  net?: unknown;
  provisional?: unknown;
}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const textOrNull = (value: unknown, max = 2000): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Normalise the posted lines, keeping the ids the client sent.
 *
 * Saving replaces the whole list rather than diffing it — the same wholesale save
 * the diary does — which makes preserving ids essential rather than cosmetic: a
 * walkthrough photo points at a line through quote_files.linked_to, and minting
 * fresh ids on every save would orphan that link on the first edit.
 * lib/diary-children.ts exists for exactly this reason; this is the same rule.
 */
export function normaliseItems(quoteId: string, incoming: IncomingItem[], timestamp: string): QuoteItem[] {
  const used = new Set<string>();
  const rows: QuoteItem[] = [];

  (Array.isArray(incoming) ? incoming : []).forEach((raw, index) => {
    const description = textOrNull(raw?.description);
    if (!description) return;   // a line with no words is not a line

    // Keep the client's id unless it is missing, malformed, or a duplicate —
    // two rows must never collide on the primary key.
    const claimed = typeof raw?.id === 'string' && ID_SHAPE.test(raw.id) ? raw.id : null;
    const id = claimed && !used.has(claimed) ? claimed : generateId();
    used.add(id);

    const qty = numberOrNull(raw?.qty);
    const rate = numberOrNull(raw?.rate);
    const explicitNet = numberOrNull(raw?.net);

    rows.push({
      id,
      quote_id: quoteId,
      section: textOrNull(raw?.section, 120) ?? undefined,
      description,
      qty: qty ?? undefined,
      unit: textOrNull(raw?.unit, 32) ?? undefined,
      rate: rate ?? undefined,
      // The stored net is derived on every save, so a plain SQL sum agrees with
      // computeTotals — it is never a figure a human typed twice.
      net: lineNet({ qty: qty ?? undefined, rate: rate ?? undefined, net: explicitNet ?? undefined }),
      provisional: raw?.provisional ? 1 : 0,
      sort_order: index,
      created_at: timestamp,
    });
  });

  return rows;
}

/** Statements that replace a quote's lines wholesale, for a single batch. */
export function buildItemStatements(quoteId: string, items: QuoteItem[]): { sql: string; params: unknown[] }[] {
  const statements: { sql: string; params: unknown[] }[] = [
    { sql: 'DELETE FROM quote_items WHERE quote_id = ?', params: [quoteId] },
  ];
  for (const item of items) {
    statements.push({
      sql: `INSERT INTO quote_items
              (id, quote_id, section, description, qty, unit, rate, net, provisional, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        item.id, quoteId, item.section ?? null, item.description,
        item.qty ?? null, item.unit ?? null, item.rate ?? null, item.net ?? null,
        item.provisional ? 1 : 0, item.sort_order, item.created_at,
      ],
    });
  }
  return statements;
}

// ── Conversion ──────────────────────────────────────────────────────────────

/** Just enough of locals to attribute the project. Never used to authorise. */
export interface QuoteActor {
  user?: { id: string } | null;
  org?: { id: string } | null;
}

export interface ConversionResult {
  project_id: string;
  /** false when the quote had already been converted — see the idempotency note. */
  created: boolean;
}

/**
 * Turn an accepted quote into a project.
 *
 * The accepted net and VAT rate are written onto the project as quoted_net /
 * quoted_vat_rate, which is exactly what computeValuation() in lib/financials.ts
 * reads for the original contract sum. That is the whole point of the exercise:
 * the valuation, the variations register and the client's invoices then all hang
 * off the figure the client actually signed.
 *
 * Idempotent by design. A double-tapped button, a retried request or a second tab
 * must not leave the business with two projects for one job, so an already
 * converted quote returns the project it already has.
 */
export async function convertToProject(
  db: D1Database,
  quote: Quote,
  locals: QuoteActor
): Promise<ConversionResult> {
  if (quote.project_id) {
    const existing = await queryOne<{ id: string }>(
      db, 'SELECT id FROM projects WHERE id = ?', [quote.project_id]
    );
    // Only trust the stamp if the project is really there; a deleted project
    // would otherwise leave the quote permanently unconvertible.
    if (existing) return { project_id: existing.id, created: false };
  }

  const items = await queryAll<QuoteItem>(
    db, 'SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order', [quote.id]
  );
  const totals = computeTotals(items, quote.vat_rate);

  const projectId = generateId();
  const timestamp = now();

  // projects.address / postcode are NOT NULL, and a quote can legitimately have
  // been raised before the address was typed in. Empty strings keep the row valid
  // and the gap visible, rather than failing the conversion outright.
  const address = quote.address?.trim() || '';
  const postcode = quote.postcode?.trim() || '';

  // Coordinates drive the weather widget. A failed lookup is not a reason to
  // refuse the conversion, so geocodePostcode's null is simply stored.
  const geo = postcode ? await geocodePostcode(postcode).catch(() => null) : null;

  await execute(
    db,
    `INSERT INTO projects
       (id, org_id, name, address, postcode, lat, lng, client_name, client_email,
        status, quoted_net, quoted_vat_rate, percent_complete,
        created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?, ?)`,
    [
      projectId, quote.org_id, quote.title.trim(), address, postcode,
      geo?.lat ?? null, geo?.lng ?? null,
      quote.client_name ?? null, quote.client_email ?? null,
      totals.net, quote.vat_rate,
      locals.user?.id ?? quote.created_by, timestamp, timestamp,
    ]
  );

  await execute(
    db,
    `UPDATE quotes
        SET project_id = ?, status = 'accepted',
            accepted_at = COALESCE(accepted_at, ?), updated_at = ?
      WHERE id = ?`,
    [projectId, timestamp, timestamp, quote.id]
  );

  return { project_id: projectId, created: true };
}

// ── Assumptions ─────────────────────────────────────────────────────────────

/**
 * The stored assumptions, parsed.
 *
 * Stored as a JSON array of strings. Bad JSON returns an empty list rather than
 * throwing — a corrupt column must not make the quote unopenable.
 */
export function parseAssumptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((a) => String(a).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Serialise assumptions back, de-duplicated and order-preserving. */
export function serialiseAssumptions(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  const cleaned = [...new Set(list.map((a) => String(a).trim()).filter(Boolean))].slice(0, 100);
  return cleaned.length ? JSON.stringify(cleaned) : null;
}
