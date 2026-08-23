import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../../lib/db';
import { validateFile, uploadToR2, getFromR2, deleteFromR2 } from '../../../../lib/r2';
import { authoriseQuote } from '../../../../lib/quotes';
import type { QuoteFile } from '../../../../types/diary';

export const prerender = false;

/**
 * Build a walkthrough photo's key: quotes/{quoteId}/{timestamp}-{filename}.
 *
 * A quote has no project and no diary entry, so it cannot live under the
 * entries/ prefix the diary uses; its own prefix keeps a job that was never won
 * clearly separate from the record of one that was.
 */
function buildQuoteKey(quoteId: string, filename: string): string {
  const ts = Date.now();
  // Sanitised to [A-Za-z0-9._-], which also means a real key never contains a
  // literal '%' — so decoding a key that arrives already decoded is a no-op.
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'photo';
  return `quotes/${quoteId}/${ts}-${safe}`;
}

/** Percent-encoded keys arrive as one query value; malformed escapes give null. */
function decodeKey(raw: string | null): string | null {
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return null; }
}

/**
 * Look a walkthrough file up by key, scoped to the quote in the URL.
 *
 * The key is resolved through quote_files before the bucket is touched, so only
 * keys this app issued can ever be served — an arbitrary key, or a traversal
 * attempt, simply is not in the table. This is the same guarantee lib/access.ts
 * documents for entry_files, and the reason /api/photos/[...key] cannot be
 * reused here: that route resolves through entry_files and would not find these.
 *
 * The quote_id is part of the lookup as well as the key, so a key belonging to
 * another business's quote cannot be fetched by pairing it with a quote id the
 * caller does happen to own.
 */
function loadQuoteFileByKey(db: D1Database, quoteId: string, key: string): Promise<QuoteFile | null> {
  return queryOne<QuoteFile>(
    db, 'SELECT * FROM quote_files WHERE quote_id = ? AND r2_key = ?', [quoteId, key]
  );
}

const coord = (raw: FormDataEntryValue | null, limit: number): number | null => {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
};

/**
 * GET /api/quotes/{id}/files          — the walkthrough's photos
 * GET /api/quotes/{id}/files?key={k}  — stream one of them back
 */
export const GET: APIRoute = async ({ locals, params, url }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const key = decodeKey(url.searchParams.get('key'));

  if (!key) {
    const files = await queryAll<QuoteFile>(
      env.DB, 'SELECT * FROM quote_files WHERE quote_id = ? ORDER BY created_at', [auth.quote.id]
    );
    return Response.json({
      files: files.map((f) => ({
        ...f,
        url: `/api/quotes/${auth.quote.id}/files?key=${encodeURIComponent(f.r2_key)}`,
      })),
    });
  }

  const file = await loadQuoteFileByKey(env.DB, auth.quote.id, key);
  if (!file) return new Response('File not found', { status: 404 });

  const object = await getFromR2(env.R2, key);
  if (!object) return new Response('File not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || file.mime_type || 'application/octet-stream');
  // Private: a walkthrough photo of somebody's house is not cacheable by a proxy.
  headers.set('Cache-Control', 'private, max-age=3600');
  if (object.size) headers.set('Content-Length', String(object.size));

  return new Response(object.body, { headers });
};

/**
 * POST /api/quotes/{id}/files — multipart upload of a walkthrough photo.
 *
 * Fields: file (required), caption, linked_to (a quote_items.id), taken_at,
 * lat, lng. Everything but the file is optional: the upload has to succeed from
 * a phone on a bad signal with location switched off.
 */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const quote = auth.quote;

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = form.get('file') as File | null;
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  const validation = validateFile(file.type, file.size);
  if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });

  const caption = (form.get('caption') as string | null)?.trim() || null;

  // linked_to must be a line on *this* quote. An id from elsewhere is dropped
  // rather than stored, so the reference can never point out of the quote.
  const claimedLink = (form.get('linked_to') as string | null)?.trim() || null;
  let linkedTo: string | null = null;
  if (claimedLink) {
    const line = await queryOne<{ id: string }>(
      env.DB, 'SELECT id FROM quote_items WHERE id = ? AND quote_id = ?', [claimedLink, quote.id]
    );
    linkedTo = line?.id ?? null;
  }

  const takenAtRaw = form.get('taken_at');
  const takenAt = typeof takenAtRaw === 'string' && takenAtRaw.trim() !== '' && !Number.isNaN(Date.parse(takenAtRaw))
    ? takenAtRaw
    : null;

  // Half a coordinate cannot be plotted, so a lone lat or lng is dropped rather
  // than stored as a fact nothing can use.
  const latRaw = coord(form.get('lat'), 90);
  const lngRaw = coord(form.get('lng'), 180);
  const lat = latRaw !== null && lngRaw !== null ? latRaw : null;
  const lng = lat !== null ? lngRaw : null;

  const r2Key = buildQuoteKey(quote.id, file.name);
  await uploadToR2(env.R2, r2Key, await file.arrayBuffer(), file.type, {
    quoteId: quote.id,
    uploadedBy: locals.user!.id,
  });

  const id = generateId();
  const timestamp = now();

  await execute(
    env.DB,
    `INSERT INTO quote_files
       (id, quote_id, r2_key, filename, mime_type, size_bytes, caption, ai_caption, ai_tags,
        linked_to, taken_at, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
    [id, quote.id, r2Key, file.name, file.type, file.size, caption, linkedTo, takenAt, lat, lng, timestamp]
  );

  // Touch the quote so the list orders by real activity, not by when it was made.
  await execute(env.DB, 'UPDATE quotes SET updated_at = ? WHERE id = ?', [timestamp, quote.id]);

  return Response.json({
    id, quote_id: quote.id, r2_key: r2Key, filename: file.name,
    mime_type: file.type, size_bytes: file.size, caption, linked_to: linkedTo,
    taken_at: takenAt, lat, lng, created_at: timestamp,
    url: `/api/quotes/${quote.id}/files?key=${encodeURIComponent(r2Key)}`,
  }, { status: 201 });
};

/**
 * PATCH /api/quotes/{id}/files?key={k} — caption a photo, or hang it off a line.
 *
 * Linking a photo to a quote line is what makes a provisional sum defensible six
 * weeks later: the photo of the cracked lintel sits against the line that priced
 * it. The line must belong to this quote — see the check in POST.
 */
export const PATCH: APIRoute = async ({ locals, params, request, url }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const key = decodeKey(url.searchParams.get('key'));
  if (!key) return Response.json({ error: 'key is required' }, { status: 400 });

  const file = await loadQuoteFileByKey(env.DB, auth.quote.id, key);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { caption?: string | null; linked_to?: string | null };

  let linkedTo = file.linked_to ?? null;
  if (body.linked_to !== undefined) {
    const claimed = body.linked_to?.trim() || null;
    if (!claimed) linkedTo = null;
    else {
      const line = await queryOne<{ id: string }>(
        env.DB, 'SELECT id FROM quote_items WHERE id = ? AND quote_id = ?', [claimed, auth.quote.id]
      );
      linkedTo = line?.id ?? null;
    }
  }

  const caption = body.caption !== undefined ? (body.caption?.trim() || null) : (file.caption ?? null);

  await execute(
    env.DB, 'UPDATE quote_files SET caption = ?, linked_to = ? WHERE id = ?', [caption, linkedTo, file.id]
  );

  return Response.json({ ...file, caption, linked_to: linkedTo });
};

/** DELETE /api/quotes/{id}/files?key={k} — remove a walkthrough photo. */
export const DELETE: APIRoute = async ({ locals, params, url }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const key = decodeKey(url.searchParams.get('key'));
  if (!key) return Response.json({ error: 'key is required' }, { status: 400 });

  const file = await loadQuoteFileByKey(env.DB, auth.quote.id, key);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  await deleteFromR2(env.R2, key).catch(() => {
    // A bucket failure must not strand the row — the record goes either way.
  });
  await execute(env.DB, 'DELETE FROM quote_files WHERE id = ?', [file.id]);

  return Response.json({ status: 'deleted' });
};
