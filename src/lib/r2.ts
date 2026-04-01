/** R2 storage helpers */

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(
  mimeType: string,
  size: number
): { valid: true } | { valid: false; error: string } {
  if (!ALLOWED_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Accepted: JPEG, PNG, WebP, HEIC, PDF.`,
    };
  }
  if (size > MAX_SIZE) {
    return {
      valid: false,
      error: `File size (${(size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit.`,
    };
  }
  return { valid: true };
}

/** Build an R2 object key: entries/{entryId}/{fileType}/{timestamp}-{filename} */
export function buildR2Key(
  entryId: string,
  fileType: string,
  filename: string
): string {
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `entries/${entryId}/${fileType}/${ts}-${safe}`;
}

/** Upload a file to R2 */
export async function uploadToR2(
  r2: R2Bucket,
  key: string,
  body: ArrayBuffer | ReadableStream,
  mimeType: string,
  metadata?: Record<string, string>
): Promise<R2Object> {
  return r2.put(key, body, {
    httpMetadata: { contentType: mimeType },
    customMetadata: metadata,
  });
}

/** Get a file from R2 */
export async function getFromR2(
  r2: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return r2.get(key);
}

/** Delete a file from R2 */
export async function deleteFromR2(
  r2: R2Bucket,
  key: string
): Promise<void> {
  await r2.delete(key);
}
