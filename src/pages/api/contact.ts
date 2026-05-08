import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;

  try {
    const formData = await request.formData();
    const data = {
      name: formData.get('name')?.toString() || '',
      email: formData.get('email')?.toString() || '',
      phone: formData.get('phone')?.toString() || '',
      service: formData.get('service')?.toString() || '',
      message: formData.get('message')?.toString() || '',
      budget: formData.get('budget')?.toString() || '',
      privacy: formData.get('privacy')?.toString() || '',
    };

    if (!data.name || !data.email || !data.message || !data.privacy) {
      return Response.json(
        { success: false, error: 'Please fill in all required fields and accept the privacy policy.' },
        { status: 400 }
      );
    }

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
        to: ['support@digitalvisibility.com'],
        reply_to: `${data.name} <${data.email}>`,
        subject: emailSubject,
        text: emailBody,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #AEDE4A;">New Contact Form Submission</h2>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Name:</strong> ${data.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
              <p><strong>Phone:</strong> ${data.phone || 'Not provided'}</p>
              <p><strong>Service Interest:</strong> ${data.service || 'Not specified'}</p>
              <p><strong>Budget Range:</strong> ${data.budget || 'Not specified'}</p>
            </div>
            <div style="background: white; padding: 20px; border-left: 4px solid #AEDE4A;">
              <h3>Message:</h3>
              <p style="white-space: pre-wrap;">${data.message}</p>
            </div>
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              Submitted: ${submittedAt}<br>
              IP: ${ip}
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
