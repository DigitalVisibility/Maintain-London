/**
 * Onboarding auto-fill: given a business's website, pull together everything we
 * can to pre-fill their branding and details, so setting up a business is a
 * review-and-tweak rather than a blank form.
 *
 * Two halves:
 *  - deterministic scraping of the page's <head> (logo/icon candidates, theme
 *    colour, title/description) — cheap and reliable;
 *  - Claude reading the page text to pull out name, phone, email, address — the
 *    fuzzy bits. It's told to extract only what's clearly there, never invent.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface SiteMeta {
  title: string | null;
  description: string | null;
  themeColor: string | null;
  logoCandidates: string[];
}

export interface ExtractedBusiness {
  business_name: string;
  description: string;
  phone: string;
  email: string;
  address: string;
}

export interface OnboardingResult extends ExtractedBusiness {
  brand_color: string | null;
  logo_candidates: string[];
  source_url: string;
}

/** Normalise a user-typed site address into a fetchable URL. */
export function normaliseUrl(raw: string): string | null {
  let s = (raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function resolveUrl(base: string, href: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1] : null;
}

/** Pull logo/icon candidates, theme colour and title/description from the HTML head. */
export function extractSiteMeta(html: string, baseUrl: string): SiteMeta {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  const links = html.match(/<link\b[^>]*>/gi) || [];
  const imgs = html.match(/<img\b[^>]*>/gi) || [];

  const metaByProp = (keys: string[]): string | null => {
    for (const tag of metas) {
      const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
      if (keys.includes(key)) return attr(tag, 'content');
    }
    return null;
  };

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (metaByProp(['og:site_name', 'og:title']) || (titleTag ? titleTag[1] : null) || '').trim() || null;
  const description = (metaByProp(['description', 'og:description']) || '').trim() || null;

  let themeColor = metaByProp(['theme-color']);
  if (themeColor) themeColor = themeColor.trim();
  if (themeColor && !/^#[0-9a-fA-F]{6}$/.test(themeColor)) themeColor = null;

  const candidates: string[] = [];
  const push = (href: string | null) => {
    if (!href) return;
    const abs = resolveUrl(baseUrl, href);
    if (abs && !candidates.includes(abs)) candidates.push(abs);
  };

  // Priority: og:image, apple-touch-icon, <img> that looks like a logo, favicons.
  push(metaByProp(['og:image', 'og:image:url', 'twitter:image']));
  for (const tag of links) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    if (rel.includes('apple-touch-icon')) push(attr(tag, 'href'));
  }
  for (const tag of imgs) {
    const hay = `${attr(tag, 'src') || ''} ${attr(tag, 'alt') || ''} ${attr(tag, 'class') || ''} ${attr(tag, 'id') || ''}`.toLowerCase();
    if (hay.includes('logo')) push(attr(tag, 'src'));
  }
  for (const tag of links) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    if (rel.includes('icon')) push(attr(tag, 'href'));
  }

  return { title, description, themeColor, logoCandidates: candidates.slice(0, 6) };
}

/** Strip a page down to visible-ish text for the model, capped. */
export function htmlToText(html: string, cap = 12000): string {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, cap);
}

/** Fetch an image from a URL (to save an AI-discovered logo into R2). */
export async function fetchRemoteImage(url: string): Promise<{ buffer: ArrayBuffer; type: string; name: string }> {
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

/** Fetch a website's HTML with a timeout and a browser-like user agent. */
export async function fetchSiteHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjectDashBot/1.0)', 'Accept': 'text/html' },
    });
    if (!res.ok) throw new Error(`The site returned ${res.status}.`);
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('html')) throw new Error('That address didn’t return a web page.');
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const SYSTEM = `You extract a business's contact and identity details from the text of their website.

Return ONLY details that are clearly present in the text. If something isn't stated, return an empty string for it — never guess, never invent a phone number, email, or address. British English. Keep the description to one plain sentence describing what the business does.`;

const SCHEMA = {
  type: 'object',
  properties: {
    business_name: { type: 'string', description: 'The trading name of the business, or empty string.' },
    description: { type: 'string', description: 'One short sentence on what the business does, or empty string.' },
    phone: { type: 'string', description: 'Main contact phone number as written, or empty string.' },
    email: { type: 'string', description: 'Main contact email, or empty string.' },
    address: { type: 'string', description: 'Postal/business address, or empty string.' },
  },
  required: ['business_name', 'description', 'phone', 'email', 'address'],
  additionalProperties: false,
} as const;

/** Ask Claude to pull the business details out of the page text. */
export async function extractBusiness(apiKey: string, meta: SiteMeta, pageText: string): Promise<ExtractedBusiness> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const client = new Anthropic({ apiKey });

  const context = [
    meta.title ? `Site title: ${meta.title}` : null,
    meta.description ? `Site description: ${meta.description}` : null,
    '',
    'Page text:',
    pageText,
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: context }],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Claude returned no content');
  const out = JSON.parse(text.text) as ExtractedBusiness;
  return {
    business_name: out.business_name || '',
    description: out.description || '',
    phone: out.phone || '',
    email: out.email || '',
    address: out.address || '',
  };
}
