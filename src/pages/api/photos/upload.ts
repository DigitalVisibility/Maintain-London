import type { APIRoute } from 'astro';
import { generateId, now, execute } from '../../../lib/db';
import { validateFile, buildR2Key, uploadToR2 } from '../../../lib/r2';
import { canAccessEntry } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { canCaption } from '../../../lib/vision';
import type { FileType } from '../../../types/diary';

export const prerender = false;

/**
 * Read a coordinate off the form, or null.
 *
 * A phone's geolocation can arrive as an empty string, "undefined", or a value
 * from a sensor that never got a fix. None of that belongs in the database:
 * a junk lat/lng is worse than no lat/lng, because a map will happily plot it.
 */
function coord(raw: FormDataEntryValue | null, limit: number): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
}

/**
 * POST /api/photos/upload
 * Accepts multipart form data with:
 * - file: the image/PDF file
 * - entry_id: diary entry ID
 * - file_type: 'photo' | 'delivery_note' | 'variation_doc'
 * - caption: optional caption
 * - linked_to: optional link reference (e.g. variation ID)
 * - taken_at: optional ISO timestamp of when the shutter fired
 * - lat, lng: optional capture coordinates
 *
 * Captioning is *not* run here. Uploads happen in bursts on a phone on site and
 * have to stay fast; the row is marked ai_status='pending' and the client calls
 * /api/photos/caption once the files are safely stored.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const entryId = formData.get('entry_id') as string | null;
  const fileType = (formData.get('file_type') as FileType) || 'photo';
  const caption = formData.get('caption') as string | null;
  const linkedTo = formData.get('linked_to') as string | null;

  // Capture metadata, all optional — the upload must still succeed from a phone
  // with location switched off.
  const takenAtRaw = formData.get('taken_at');
  const takenAt = typeof takenAtRaw === 'string' && takenAtRaw.trim() !== ''
    && !Number.isNaN(Date.parse(takenAtRaw))
    ? takenAtRaw
    : null;
  // Half a coordinate can't be plotted, so a lone lat or lng is dropped rather
  // than stored as a fact nothing can use.
  const latRaw = coord(formData.get('lat'), 90);
  const lngRaw = coord(formData.get('lng'), 180);
  const lat = latRaw !== null && lngRaw !== null ? latRaw : null;
  const lng = lat !== null ? lngRaw : null;

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!entryId) {
    return Response.json({ error: 'entry_id is required' }, { status: 400 });
  }

  // The entry must exist and belong to a project this user may write to.
  if (!hasCap(locals, 'edit_diary') || !(await canAccessEntry(env.DB, locals, entryId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate file type and size
  const validation = validateFile(file.type, file.size);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  // Build R2 key and upload
  const r2Key = buildR2Key(entryId, fileType, file.name);
  const buffer = await file.arrayBuffer();

  await uploadToR2(env.R2, r2Key, buffer, file.type, {
    entryId,
    uploadedBy: user.id,
  });

  // Store metadata in D1
  const fileId = generateId();
  const timestamp = now();

  // Only formats the vision model can actually read are queued for captioning.
  // HEIC from an iPhone and PDF delivery notes stay null, so they never sit in
  // the UI as photos "waiting" for a caption that can never arrive.
  const aiStatus = canCaption(file.type) ? 'pending' : null;

  await execute(
    env.DB,
    `INSERT INTO entry_files (id, entry_id, r2_key, filename, file_type, mime_type, size_bytes, caption, linked_to, created_at, taken_at, lat, lng, ai_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fileId, entryId, r2Key, file.name, fileType, file.type, file.size, caption, linkedTo, timestamp, takenAt, lat, lng, aiStatus]
  );

  return Response.json({
    id: fileId,
    r2_key: r2Key,
    filename: file.name,
    file_type: fileType,
    mime_type: file.type,
    size_bytes: file.size,
    caption,
    taken_at: takenAt,
    lat,
    lng,
    ai_status: aiStatus,
    url: `/api/photos/${encodeURIComponent(r2Key)}`,
  }, { status: 201 });
};
