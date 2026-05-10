import type { APIRoute } from 'astro';

export const prerender = false;

const FIELD_LIMITS = {
  name: 100,
  email: 254,
  phone: 30,
  service: 50,
  message: 5000,
  budget: 50,
} as const;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;

  try {
    const formData = await request.formData();

    if (formData.get('website')?.toString().trim()) {
      return Response.json({ success: true, message: 'Thank you for your message.' });
    }

    const turnstileToken = formData.get('cf-turnstile-response')?.toString() || '';
    if (!turnstileToken) {
      return Response.json(
        { success: false, error: 'Security verification missing. Please refresh the page and try again.' },
        { status: 400 }
      );
    }

    const turnstileVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP'),
      }),
    });
    const turnstileResult = await turnstileVerify.json() as { success: boolean };
    if (!turnstileResult.success) {
      return Response.json(
        { success: false, error: 'Security verification failed. Please try again.' },
        { status: 403 }
      );
    }

    const data = {
      name: (formData.get('name')?.toString() || '').trim().slice(0, FIELD_LIMITS.name),
      email: (formData.get('email')?.toString() || '').trim().slice(0, FIELD_LIMITS.email),
      phone: (formData.get('phone')?.toString() || '').trim().slice(0, FIELD_LIMITS.phone),
      service: (formData.get('service')?.toString() || '').trim().slice(0, FIELD_LIMITS.service),
      message: (formData.get('message')?.toString() || '').trim().slice(0, FIELD_LIMITS.message),
      budget: (formData.get('budget')?.toString() || '').trim().slice(0, FIELD_LIMITS.budget),
      privacy: formData.get('privacy')?.toString() || '',
    };

    if (!data.name || !data.email || !data.message || !data.privacy) {
      return Response.json(
        { success: false, error: 'Please fill in all required fields and accept the privacy policy.' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return Response.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const safe = {
      name: escapeHtml(data.name),
      email: escapeHtml(data.email),
      phone: escapeHtml(data.phone),
      service: escapeHtml(data.service),
      message: escapeHtml(data.message),
      budget: escapeHtml(data.budget),
    };

    const emailSubject = `New Contact Form Submission from ${data.name}`;
    const submittedAt = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';

    const emailBody = `
New contact form submission from Maintain London website:

Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone || 'Not provided'}
Service Interest: ${data.service || 'Not specified'}
Budget Range: ${data.budget || 'Not specified'}

Message:
${data.message}

---
Submitted at: ${submittedAt}
IP Address: ${ip}
`;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Maintain London Website <noreply@mail.maintainlondon.co.uk>',
        to: ['admin@maintainlondon.co.uk'],
        reply_to: `${data.name} <${data.email}>`,
        subject: emailSubject,
        text: emailBody,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #AEDE4A;">New Contact Form Submission</h2>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Name:</strong> ${safe.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${safe.email}">${safe.email}</a></p>
              <p><strong>Phone:</strong> ${safe.phone || 'Not provided'}</p>
              <p><strong>Service Interest:</strong> ${safe.service || 'Not specified'}</p>
              <p><strong>Budget Range:</strong> ${safe.budget || 'Not specified'}</p>
            </div>
            <div style="background: white; padding: 20px; border-left: 4px solid #AEDE4A;">
              <h3>Message:</h3>
              <p style="white-space: pre-wrap;">${safe.message}</p>
            </div>
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              Submitted: ${submittedAt}<br>
              IP: ${escapeHtml(ip)}
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Resend error:', errorText);
      return Response.json(
        { success: false, error: 'Sorry, there was an error sending your message. Please try again or contact us directly.' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "Thank you for your message. We'll get back to you soon!",
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return Response.json(
      { success: false, error: 'Sorry, there was an error sending your message. Please try again or contact us directly.' },
      { status: 500 }
    );
  }
};
