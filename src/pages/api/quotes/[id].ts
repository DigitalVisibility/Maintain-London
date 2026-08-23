import type { APIRoute } from 'astro';
import { queryAll, batch, now } from '../../../lib/db';
import { deleteFromR2 } from '../../../lib/r2';
import {
  authoriseQuote, loadQuote, computeTotals, normaliseItems, buildItemStatements,
  assertTransition, isQuoteStatus, parseAssumptions, serialiseAssumptions,
} from '../../../lib/quotes';
import type { QuoteStatus } from '../../../types/diary';

export const prerender = false;

/** GET /api/quotes/{id} — the quote, its lines, its photos and its transcripts. */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;

  // Authorised from the stored row before anything else is read.
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const quote = await loadQuote(env.DB, auth.quote.id);
  if (!quote) return Response.json({ error: 'Quote not found' }, { status: 404 });

  return Response.json({
    quote,
    totals: computeTotals(quote.items, quote.vat_rate),
    assumptions: parseAssumptions(quote.assumptions),
  });
};

interface UpdateBody {
  title?: string;
  client_name?: string | null;
  client_email?: string | null;
  address?: string | null;
  postcode?: string | null;
  vat_rate?: number;
  notes?: string | null;
  assumptions?: string[];
  status?: string;
  items?: unknown[];
}

/**
 * PUT /api/quotes/{id} — save the quote and replace its lines.
 *
 * A full-list save, the same way the diary saves an entry's children: the client
 * sends the lines as they now stand and the server swaps them wholesale. The ids
 * the client sends are preserved (see normaliseItems), because a walkthrough
 * photo points at a line by id through quote_files.linked_to — regenerating ids
 * on save would quietly orphan every one of those links on the first edit.
 */
export const PUT: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const quote = auth.quote;
  const body = await request.json().catch(() => ({})) as UpdateBody;
  const timestamp = now();

  // ── Status ───────────────────────────────────────────────────────────────
  let status: QuoteStatus = quote.status;
  if (body.status !== undefined) {
    if (!isQuoteStatus(body.status)) {
      return Response.json({ error: `"${body.status}" is not a quote status` }, { status: 400 });
    }
    try {
      assertTransition(quote.status, body.status);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Invalid status change' }, { status: 409 });
    }
    status = body.status;
  }

  // An accepted quote is the document the client agreed to and the source of the
  // project's contract sum. Its wording and figures stop being editable at that
  // point; a change after acceptance is a variation, which the register owns.
  const frozen = quote.status === 'accepted' || quote.status === 'declined';
  if (frozen && (body.items !== undefined || body.title !== undefined || body.vat_rate !== undefined)) {
    return Response.json(
      { error: `A ${quote.status} quote can no longer be edited. Changes after acceptance belong on the variations register.` },
      { status: 409 }
    );
  }

  const title = body.title?.trim() || quote.title;
  if (!title) return Response.json({ error: 'A title is required' }, { status: 400 });

  const vatRate = Number.isFinite(Number(body.vat_rate)) ? Number(body.vat_rate) : quote.vat_rate;

  // Assumptions are only touched when the caller sends the key at all, so a
  // partial save from a form that doesn't render them cannot wipe the list.
  const assumptions = body.assumptions !== undefined
    ? serialiseAssumptions(body.assumptions)
    : (quote.assumptions ?? null);

  const statements: { sql: string; params?: unknown[] }[] = [{
    sql: `UPDATE quotes
             SET title = ?, client_name = ?, client_email = ?, address = ?, postcode = ?,
                 vat_rate = ?, notes = ?, assumptions = ?, status = ?,
                 sent_at = CASE WHEN ? = 'draft' THEN NULL ELSE COALESCE(sent_at, ?) END,
                 accepted_at = CASE WHEN ? = 'accepted' THEN COALESCE(accepted_at, ?) ELSE accepted_at END,
                 updated_at = ?
           WHERE id = ?`,
    params: [
      title,
      body.client_name !== undefined ? (body.client_name?.trim() || null) : (quote.client_name ?? null),
      body.client_email !== undefined ? (body.client_email?.trim() || null) : (quote.client_email ?? null),
      body.address !== undefined ? (body.address?.trim() || null) : (quote.address ?? null),
      body.postcode !== undefined ? (body.postcode?.trim() || null) : (quote.postcode ?? null),
      vatRate,
      body.notes !== undefined ? (body.notes?.trim() || null) : (quote.notes ?? null),
      assumptions,
      status,
      // Pulling a sent quote back to draft clears the sent stamp: it has not
      // been issued in its new form, and leaving the old date on it would read
      // as though the client had already seen these figures.
      status, timestamp,
      status, timestamp,
      timestamp, quote.id,
    ],
  }];

  const items = body.items !== undefined
    ? normaliseItems(quote.id, body.items as never[], timestamp)
    : null;
  if (items) statements.push(...buildItemStatements(quote.id, items));

  // One batch, so a save never leaves the quote updated with its old lines (or
  // its lines deleted and never re-inserted).
  await batch(env.DB, statements);

  const saved = await loadQuote(env.DB, quote.id);
  return Response.json({
    quote: saved,
    totals: computeTotals(saved?.items ?? [], saved?.vat_rate ?? vatRate),
    assumptions: parseAssumptions(saved?.assumptions),
  });
};

/**
 * DELETE /api/quotes/{id} — bin a quote and everything hanging off it.
 *
 * A converted quote is refused: it is the evidence for the figure the client
 * signed, and the project's contract sum points back at it. Losing that leaves a
 * project whose quoted sum nobody can account for.
 */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const quote = auth.quote;
  if (quote.project_id) {
    return Response.json(
      { error: 'This quote has been converted into a project and is the record of the agreed sum. It cannot be deleted.' },
      { status: 409 }
    );
  }

  // Clear the bucket before the rows: an orphaned R2 object can still be found
  // and removed later, but an orphaned key with no row is invisible for ever.
  const stored = await queryAll<{ r2_key: string }>(
    env.DB,
    `SELECT r2_key FROM quote_files WHERE quote_id = ?
     UNION ALL
     SELECT r2_key FROM voice_notes WHERE quote_id = ?`,
    [quote.id, quote.id]
  );
  for (const file of stored) {
    await deleteFromR2(env.R2, file.r2_key).catch(() => {
      // A bucket failure must not strand the row; the delete carries on.
    });
  }

  await batch(env.DB, [
    { sql: 'DELETE FROM quote_items WHERE quote_id = ?', params: [quote.id] },
    { sql: 'DELETE FROM quote_files WHERE quote_id = ?', params: [quote.id] },
    { sql: 'DELETE FROM voice_notes WHERE quote_id = ?', params: [quote.id] },
    { sql: 'DELETE FROM quotes WHERE id = ?', params: [quote.id] },
  ]);

  return Response.json({ status: 'deleted' });
};
