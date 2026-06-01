/**
 * Thin wrapper around Resend for transactional email (invites, approval
 * notifications, etc.). Mirrors the setup already used by the contact form.
 */

const FROM = 'Maintain London Project Hub <noreply@mail.maintainlondon.co.uk>';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
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
        from: FROM,
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

/** Branded button-style HTML email wrapper. */
export function emailLayout(opts: { heading: string; body: string; ctaLabel?: string; ctaUrl?: string }): string {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<div style="margin:28px 0"><a href="${opts.ctaUrl}" style="display:inline-block;background:#AEDE4A;color:#111827;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px">${opts.ctaLabel}</a></div>
       <p style="color:#6B7280;font-size:12px">Or paste this link into your browser:<br><span style="color:#374151">${opts.ctaUrl}</span></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
    <h2 style="color:#111827;border-bottom:3px solid #AEDE4A;padding-bottom:12px">${opts.heading}</h2>
    <div style="font-size:15px;line-height:1.6">${opts.body}</div>
    ${cta}
    <hr style="margin:28px 0;border:none;border-top:1px solid #E5E7EB">
    <p style="color:#9CA3AF;font-size:12px">Maintain London Project Hub</p>
  </div>`;
}
