import type { APIRoute } from 'astro';
import { queryAll, batch, generateId, now } from '../../../../lib/db';
import { getFromR2 } from '../../../../lib/r2';
import {
  authoriseQuote, loadQuote, loadTranscripts, computeTotals,
  parseAssumptions, serialiseAssumptions,
} from '../../../../lib/quotes';
import { draftScope, canSeePhoto, MAX_SCOPE_PHOTOS, type ScopePhoto } from '../../../../lib/quote-ai';
import type { QuoteFile } from '../../../../types/diary';

export const prerender = false;

/**
 * POST /api/quotes/{id}/draft — build the scope from the walkthrough.
 *
 * Gathers the quote's transcribed voice notes and the photos taken on the walk,
 * asks Claude for a sectioned scope, and inserts the result as *unpriced* quote
 * lines. Nothing is priced here by design: the estimator prices, the machine
 * only proposes what the work is.
 *
 * Drafting appends rather than replaces. A second walk of the same job (the
 * upstairs, on a return visit) adds to the scope; wiping the lines an estimator
 * has already priced would be unforgivable.
 */
export const POST: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const quote = auth.quote;

  if (quote.status !== 'draft') {
    return Response.json(
      { error: `This quote has been ${quote.status}. Drafting scope onto it would change a quote the client has already seen.` },
      { status: 409 }
    );
  }

  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI drafting is not configured' }, { status: 503 });
  }

  // ── Source material ──────────────────────────────────────────────────────
  const transcripts = await loadTranscripts(env.DB, quote.id);
  if (transcripts.length === 0) {
    // Scope drafted from photographs alone is invention: a picture shows a room
    // in a state, not what the builder intends to do to it. Refused outright
    // rather than producing something plausible and wrong.
    return Response.json(
      { error: 'Record at least one voice note on the walkthrough first. A scope drafted from photos alone would be invented, not observed.' },
      { status: 400 }
    );
  }

  const allFiles = await queryAll<QuoteFile>(
    env.DB, 'SELECT * FROM quote_files WHERE quote_id = ? ORDER BY created_at', [quote.id]
  );
  // HEIC straight off an iPhone and PDF attachments cannot be sent as image
  // blocks at all, so they are separated out and reported rather than counted as
  // photos the model "used".
  const viewable = allFiles.filter((f) => canSeePhoto(f.mime_type));
  const unreadable = allFiles.length - viewable.length;
  const chosen = viewable.slice(0, MAX_SCOPE_PHOTOS);

  const photos: ScopePhoto[] = [];
  const missing: string[] = [];
  for (const file of chosen) {
    const object = await getFromR2(env.R2, file.r2_key);
    if (!object) { missing.push(file.filename); continue; }
    photos.push({
      data: await object.arrayBuffer(),
      mimeType: file.mime_type,
      label: file.caption || file.ai_caption || file.filename,
    });
  }

  // ── Draft ────────────────────────────────────────────────────────────────
  let drafted;
  try {
    drafted = await draftScope(env.ANTHROPIC_API_KEY, {
      transcripts,
      photos,
      title: quote.title,
      address: [quote.address, quote.postcode].filter(Boolean).join(', ') || null,
      clientName: quote.client_name ?? null,
      notes: quote.notes ?? null,
    });
  } catch (err) {
    // The walkthrough is untouched, so this is a retry rather than a loss.
    return Response.json(
      { error: err instanceof Error ? err.message : 'Drafting the scope failed' },
      { status: 502 }
    );
  }

  // ── Store ────────────────────────────────────────────────────────────────
  const timestamp = now();
  const existing = await queryAll<{ max_sort: number | null }>(
    env.DB, 'SELECT MAX(sort_order) AS max_sort FROM quote_items WHERE quote_id = ?', [quote.id]
  );
  let sortOrder = (existing[0]?.max_sort ?? -1) + 1;

  const statements: { sql: string; params?: unknown[] }[] = [];
  let inserted = 0;

  for (const section of drafted.sections) {
    for (const line of section.items) {
      statements.push({
        sql: `INSERT INTO quote_items
                (id, quote_id, section, description, qty, unit, rate, net, provisional, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        // rate and net are explicitly NULL: the line arrives as scope awaiting a
        // price, and a zero would read on screen as "priced at nothing".
        params: [
          generateId(), quote.id, section.name, line.description,
          line.qty ?? null, line.unit ?? null,
          line.provisional ? 1 : 0, sortOrder++, timestamp,
        ],
      });
      inserted++;
    }
  }

  // Merge rather than overwrite — an assumption an estimator added by hand, or
  // one raised by an earlier walk, must survive a second draft.
  const merged = serialiseAssumptions([
    ...parseAssumptions(quote.assumptions),
    ...drafted.assumptions,
  ]);

  statements.push({
    sql: `UPDATE quotes
             SET assumptions = ?,
                 notes = COALESCE(NULLIF(notes, ''), ?),
                 updated_at = ?
           WHERE id = ?`,
    params: [merged, drafted.notes ?? null, timestamp, quote.id],
  });

  await batch(env.DB, statements);

  const saved = await loadQuote(env.DB, quote.id);

  return Response.json({
    quote: saved,
    totals: computeTotals(saved?.items ?? [], saved?.vat_rate ?? quote.vat_rate),
    assumptions: parseAssumptions(saved?.assumptions),
    drafted: {
      sections: drafted.sections.length,
      lines: inserted,
      suggested_title: drafted.title ?? null,
    },
    // Reported, never silent. If a builder took thirty photos and twelve were
    // read, they need to know which twelve so they can judge what the scope may
    // have missed — a truncation nobody was told about is a hole in the price.
    source: {
      transcripts: transcripts.length,
      photos_available: allFiles.length,
      photos_used: photos.length,
      photos_skipped_unreadable: unreadable,
      photos_skipped_over_limit: Math.max(0, viewable.length - chosen.length),
      photos_missing_from_storage: missing,
      limit: MAX_SCOPE_PHOTOS,
    },
  });
};
