/**
 * Transactional email (invites, approvals, client summaries, message alerts).
 *
 * This is a multi-tenant platform, so an email must carry the identity of the
 * business that sent it — not the platform's. A builder's client receiving an
 * email branded with a *different* builder's name is both baffling and a leak of
 * who else uses the product.
 *
 * The envelope address stays on the platform's verified domain (Resend will only
 * send from a domain that has been verified, and each tenant is not going to
 * verify one). The *display name* and the branding are the tenant's, and replies
 * are routed back to them. That is the standard shape: it reads as "Rival
 * Builders" in the inbox, and a reply reaches Rival Builders.
 */

import { queryOne } from './db';

/** The verified envelope address. Only the display name in front of it varies. */
const ENVELOPE = 'noreply@mail.maintainlondon.co.uk';
const PLATFORM_NAME = 'Project Dash';
const PLATFORM_COLOR = '#AEDE4A';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Full "Name <addr>" sender. Defaults to the platform. */
  from?: string;
}

/**
 * Send an email via Resend. Returns true on success. Never throws — callers
 * decide how to handle a failure (e.g. surface "invite created but email
 * failed, here's the link").
 */
export async function sendEmail(apiKey: string | undefined, opts: SendEmailOptions): Promise<boolean> {
  if (!apiKey) {
    console.error('sendEmail: RESEND_API_KEY is not set');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: opts.from ?? `${PLATFORM_NAME} <${ENVELOPE}>`,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error('sendEmail: Resend error', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('sendEmail: failed', err);
    return false;
  }
}

/** The identity an email goes out under. */
export interface Sender {
  from: string;
  replyTo?: string;
  brandName: string;
  brandColor: string;
}

export interface OrgBrand {
  name?: string | null;
  brand_color?: string | null;
  email_from?: string | null;
}

/**
 * Build the sender for a business. Its name appears in the recipient's inbox and
 * on the email; replies go to the business, not into the void.
 */
export function senderFor(org?: OrgBrand | null): Sender {
  const name = org?.name?.trim() || PLATFORM_NAME;
  // A business name goes straight into the "Name <addr>" header, so quotes,
  // angle brackets and — above all — CR/LF must not survive: a newline here is a
  // header-injection primitive (a smuggled Bcc:, say). Replace with a space so
  // the words don't run together, then collapse.
  const safeName = name
    .replace(/["<>\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 78) || PLATFORM_NAME;

  return {
    from: `${safeName} <${ENVELOPE}>`,
    replyTo: org?.email_from?.trim() || undefined,
    brandName: safeName,
    brandColor: org?.brand_color?.trim() || PLATFORM_COLOR,
  };
}

/** Look a business's branding up by id. */
export async function loadSender(db: D1Database, orgId?: string | null): Promise<Sender> {
  if (!orgId) return senderFor(null);
  const org = await queryOne<OrgBrand>(
    db,
    'SELECT name, brand_color, email_from FROM organisations WHERE id = ?',
    [orgId]
  );
  return senderFor(org);
}

/** Branded HTML email wrapper. Falls back to the platform's look when no tenant. */
export function emailLayout(opts: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  sender?: Sender;
}): string {
  const brandName = opts.sender?.brandName ?? PLATFORM_NAME;
  const brandColor = opts.sender?.brandColor ?? PLATFORM_COLOR;

  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<div style="margin:28px 0"><a href="${opts.ctaUrl}" style="display:inline-block;background:${brandColor};color:#111827;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px">${opts.ctaLabel}</a></div>
       <p style="color:#6B7280;font-size:12px">Or paste this link into your browser:<br><span style="color:#374151">${opts.ctaUrl}</span></p>`
    : '';

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
    <h2 style="color:#111827;border-bottom:3px solid ${brandColor};padding-bottom:12px">${opts.heading}</h2>
    <div style="font-size:15px;line-height:1.6">${opts.body}</div>
    ${cta}
    <hr style="margin:28px 0;border:none;border-top:1px solid #E5E7EB">
    <p style="color:#9CA3AF;font-size:12px">${brandName}</p>
  </div>`;
}
