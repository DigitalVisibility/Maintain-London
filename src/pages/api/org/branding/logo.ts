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

/**
 * POST /api/org/branding/logo  (multipart: file)
 * Upload/replace the active business's logo. Owners/admins only.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users')) return new Response('Forbidden', { status: 403 });

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = formData.get('file') as File | null;
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  const validation = validateFile(file.type, file.size);
  if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });
  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Logo must be an image (PNG, JPEG or WebP).' }, { status: 400 });
  }

  const org = await queryOne<{ logo_url: string | null }>(
    env.DB, 'SELECT logo_url FROM organisations WHERE id = ?', [locals.org.id]
  );

  const safeName = (file.name || 'logo').replace(/[^A-Za-z0-9._-]/g, '-').slice(-40);
  const key = `branding/${locals.org.id}/${Date.now()}-${safeName}`;
  await uploadToR2(env.R2, key, await file.arrayBuffer(), file.type, { orgId: locals.org.id });

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
