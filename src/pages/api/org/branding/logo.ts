import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../../lib/db';
import { validateFile, uploadToR2, deleteFromR2 } from '../../../../lib/r2';
import { hasCap } from '../../../../lib/capabilities';

export const prerender = false;

/** The R2 key currently behind a `/api/branding/...` logo URL, if any. */
function keyFromLogoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^\/api\/branding\/([^?]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

/** Fetch an image from a URL (used to save an AI-discovered logo). */
async function fetchImage(url: string): Promise<{ buffer: ArrayBuffer; type: string; name: string }> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid image address.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid image address.');

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'ProjectDashBot/1.0' } });
    if (!res.ok) throw new Error(`Could not fetch that image (${res.status}).`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!type.startsWith('image/')) throw new Error('That link isn’t an image.');
    const buffer = await res.arrayBuffer();
    const name = (parsed.pathname.split('/').pop() || 'logo').replace(/[^A-Za-z0-9._-]/g, '-') || 'logo';
    return { buffer, type, name };
  } finally {
    clearTimeout(t);
  }
}

/**
 * POST /api/org/branding/logo
 *   multipart { file }        — upload a logo file, OR
 *   JSON { url }              — save a logo from a web address (AI auto-fill)
 * Upload/replace the active business's logo. Owners/admins only.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const contentType = request.headers.get('content-type') || '';
  let bytes: ArrayBuffer;
  let mime: string;
  let originalName: string;

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({})) as { url?: string };
    if (!body.url) return Response.json({ error: 'No image address provided' }, { status: 400 });
    try {
      const img = await fetchImage(body.url);
      bytes = img.buffer; mime = img.type; originalName = img.name;
    } catch (err: any) {
      return Response.json({ error: err?.message || 'Could not fetch image' }, { status: 400 });
    }
  } else {
    let formData: FormData;
    try { formData = await request.formData(); }
    catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }
    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    bytes = await file.arrayBuffer(); mime = file.type; originalName = file.name || 'logo';
  }

  const validation = validateFile(mime, bytes.byteLength);
  if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });
  if (!mime.startsWith('image/')) {
    return Response.json({ error: 'Logo must be an image (PNG, JPEG or WebP).' }, { status: 400 });
  }

  const org = await queryOne<{ logo_url: string | null }>(
    env.DB, 'SELECT logo_url FROM organisations WHERE id = ?', [locals.org.id]
  );

  const safeName = originalName.replace(/[^A-Za-z0-9._-]/g, '-').slice(-40) || 'logo';
  const key = `branding/${locals.org.id}/${Date.now()}-${safeName}`;
  await uploadToR2(env.R2, key, bytes, mime, { orgId: locals.org.id });

  const logoUrl = `/api/branding/${encodeURIComponent(key)}`;
  await execute(env.DB, 'UPDATE organisations SET logo_url = ? WHERE id = ?', [logoUrl, locals.org.id]);

  // Clean up the previously uploaded logo (if it was one of ours).
  const oldKey = keyFromLogoUrl(org?.logo_url);
  if (oldKey && oldKey !== key) await deleteFromR2(env.R2, oldKey).catch(() => {});

  return Response.json({ success: true, logo_url: logoUrl });
};

/** DELETE /api/org/branding/logo — remove the logo (revert to name-only branding). */
export const DELETE: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const org = await queryOne<{ logo_url: string | null }>(
    env.DB, 'SELECT logo_url FROM organisations WHERE id = ?', [locals.org.id]
  );
  await execute(env.DB, 'UPDATE organisations SET logo_url = NULL WHERE id = ?', [locals.org.id]);
  const oldKey = keyFromLogoUrl(org?.logo_url);
  if (oldKey) await deleteFromR2(env.R2, oldKey).catch(() => {});
  return Response.json({ success: true });
};
