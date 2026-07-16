import type { APIRoute } from 'astro';
import { hasCap } from '../../../lib/capabilities';
import {
  normaliseUrl, fetchSiteHtml, extractSiteMeta, htmlToText, extractBusiness,
} from '../../../lib/onboarding';
import { slugify } from '../../../lib/platform';

export const prerender = false;

/**
 * POST /api/onboarding/inspect  { url }
 * Look at a business's website and return pre-fill suggestions for their
 * branding and details (name, description, phone, email, address, brand colour,
 * logo candidates). Owners/admins or platform admins only.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users') && !locals.isPlatformAdmin) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI auto-fill isn’t configured on this deployment.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { url?: string };
  const url = normaliseUrl(body.url || '');
  if (!url) return Response.json({ error: 'Enter a valid website address.' }, { status: 400 });

  let html: string;
  try {
    html = await fetchSiteHtml(url);
  } catch (err: any) {
    return Response.json({ error: err?.message || 'Could not reach that website.' }, { status: 400 });
  }

  const meta = extractSiteMeta(html, url);
  let business;
  try {
    business = await extractBusiness(env.ANTHROPIC_API_KEY, meta, htmlToText(html));
  } catch (err: any) {
    return Response.json({ error: err?.message || 'Could not read that website.' }, { status: 502 });
  }

  return Response.json({
    ...business,
    brand_color: meta.themeColor,
    logo_candidates: meta.logoCandidates,
    suggested_slug: slugify(business.business_name),
    source_url: url,
  });
};
