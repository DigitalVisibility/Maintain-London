import type { APIRoute } from 'astro';
import { queryAll } from '../../../lib/db';
import {
  authoriseQuotes, createQuote, computeTotals, parseAssumptions,
} from '../../../lib/quotes';
import type { Quote, QuoteItem, QuoteTotals } from '../../../types/diary';

export const prerender = false;

interface QuoteListRow extends Quote {
  totals: QuoteTotals;
  item_count: number;
  photo_count: number;
  assumption_count: number;
}

/**
 * GET /api/quotes — every quote for the active business, newest first.
 *
 * Totals are computed here rather than read from a column, so the list and the
 * open quote can never show two different figures for the same job.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  const auth = authoriseQuotes(locals);
  if (!auth.ok) return auth.response;

  const status = url.searchParams.get('status');

  let sql = 'SELECT * FROM quotes WHERE org_id = ?';
  const params: unknown[] = [auth.orgId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT 500';

  const quotes = await queryAll<Quote>(env.DB, sql, params);
  if (quotes.length === 0) return Response.json({ quotes: [] });

  // One query for every line, then grouped in memory — a per-quote round trip
  // would be N+1 against D1 for a list that routinely runs to dozens of jobs.
  // The subselect keeps the org filter on the server rather than trusting a list
  // of ids assembled in this process.
  const items = await queryAll<QuoteItem>(
    env.DB,
    `SELECT * FROM quote_items
      WHERE quote_id IN (SELECT id FROM quotes WHERE org_id = ?)
      ORDER BY sort_order`,
    [auth.orgId]
  );
  const photoCounts = await queryAll<{ quote_id: string; n: number }>(
    env.DB,
    `SELECT quote_id, COUNT(*) AS n FROM quote_files
      WHERE quote_id IN (SELECT id FROM quotes WHERE org_id = ?)
      GROUP BY quote_id`,
    [auth.orgId]
  );

  const byQuote = new Map<string, QuoteItem[]>();
  for (const item of items) {
    const list = byQuote.get(item.quote_id) ?? [];
    list.push(item);
    byQuote.set(item.quote_id, list);
  }
  const photos = new Map(photoCounts.map((p) => [p.quote_id, p.n]));

  const rows: QuoteListRow[] = quotes.map((quote) => {
    const quoteItems = byQuote.get(quote.id) ?? [];
    return {
      ...quote,
      totals: computeTotals(quoteItems, quote.vat_rate),
      item_count: quoteItems.length,
      photo_count: photos.get(quote.id) ?? 0,
      assumption_count: parseAssumptions(quote.assumptions).length,
    };
  });

  return Response.json({ quotes: rows });
};

/**
 * POST /api/quotes — start a quote.
 *
 * Title only is enough. The point of the object is that a builder can create it
 * standing on the pavement before a walk-round; demanding an address and a client
 * email up front is how you end up with the walk going into a notes app instead.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const auth = authoriseQuotes(locals);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    title?: string; client_name?: string; client_email?: string;
    address?: string; postcode?: string; vat_rate?: number; notes?: string;
  };

  if (!body.title?.trim()) {
    return Response.json({ error: 'A title is required' }, { status: 400 });
  }

  const quote = await createQuote(env.DB, {
    orgId: auth.orgId,
    title: body.title,
    clientName: body.client_name,
    clientEmail: body.client_email,
    address: body.address,
    postcode: body.postcode,
    vatRate: body.vat_rate,
    notes: body.notes,
    createdBy: locals.user!.id,
  });

  return Response.json(quote, { status: 201 });
};
