export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    // Parse form data
    const formData = await request.formData();
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      service: formData.get('service'),
      message: formData.get('message'),
      budget: formData.get('budget'),
      privacy: formData.get('privacy')
    };

    // Validate required fields
    if (!data.name || !data.email || !data.message || !data.privacy) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Please fill in all required fields and accept the privacy policy.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Email content
    const emailSubject = `New Contact Form Submission from ${data.name}`;
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
Submitted at: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
IP Address: ${request.headers.get('CF-Connecting-IP') || 'Unknown'}
`;

    // Send email using Cloudflare's MailChannels
    const emailResponse = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: 'darrangoulding@gmail.com', name: 'Darran Goulding' }],
            reply_to: { email: data.email, name: data.name }
          }
        ],
        from: {
          email: 'noreply@maintainlondon.co.uk',
          name: 'Maintain London Website'
        },
        subject: emailSubject,
        content: [
          {
            type: 'text/plain',
            value: emailBody
          },
          {
            type: 'text/html',
            value: `
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
                  Submitted: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}<br>
                  IP: ${request.headers.get('CF-Connecting-IP') || 'Unknown'}
                </p>
              </div>
            `
          }
        ]
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Email sending failed:', errorText);
      throw new Error('Failed to send email');
    }

    // Return success response
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Thank you for your message. We\'ll get back to you soon!' 
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('Contact form error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Sorry, there was an error sending your message. Please try again or contact us directly.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle OPTIONS requests for CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
} 