import type { APIRoute } from 'astro';
import { generateId, now, execute } from '../../../lib/db';
import { validateFile, buildR2Key, uploadToR2 } from '../../../lib/r2';
import type { FileType } from '../../../types/diary';

export const prerender = false;

/**
 * POST /api/photos/upload
 * Accepts multipart form data with:
 * - file: the image/PDF file
 * - entry_id: diary entry ID
 * - file_type: 'photo' | 'delivery_note' | 'variation_doc'
 * - caption: optional caption
 * - linked_to: optional link reference (e.g. variation ID)
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

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!entryId) {
    return Response.json({ error: 'entry_id is required' }, { status: 400 });
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

  await execute(
    env.DB,
    `INSERT INTO entry_files (id, entry_id, r2_key, filename, file_type, mime_type, size_bytes, caption, linked_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fileId, entryId, r2Key, file.name, fileType, file.type, file.size, caption, linkedTo, timestamp]
  );

  return Response.json({
    id: fileId,
    r2_key: r2Key,
    filename: file.name,
    file_type: fileType,
    mime_type: file.type,
    size_bytes: file.size,
    caption,
    url: `/api/photos/${encodeURIComponent(r2Key)}`,
  }, { status: 201 });
};
