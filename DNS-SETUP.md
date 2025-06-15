# DNS Setup for Contact Form Email

To enable email sending from your contact form, add these DNS records in your Cloudflare DNS settings:

## Required DNS Records

### 1. SPF Record
**Type:** TXT  
**Name:** maintainlondon.co.uk (or @)  
**Value:** `v=spf1 a mx include:relay.mailchannels.net ~all`

### 2. DKIM Record  
**Type:** TXT  
**Name:** mailchannels._domainkey  
**Value:** `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDYzJGLxI8VIIrdK9MQudxkiDAMGL7RyXF8rbVB4c9C0prcn6xnk2Q5QjMOnUoXJf/PvNYmfdADUSHTdmsK7E7jCpcV/HjLKIhZU7EvMjvQezWfsalyKtXPWRRzge/FjbqbwHinOqQWDyVLnag==`

### 3. DMARC Record
**Type:** TXT  
**Name:** _dmarc  
**Value:** `v=DMARC1; p=none; rua=mailto:darrangoulding@gmail.com`

## Steps to Add Records:

1. Go to your Cloudflare dashboard
2. Select your domain (maintainlondon.co.uk)
3. Go to DNS > Records
4. Click "Add record" for each of the above
5. Save changes

## Verification:

After adding these records, wait 24-48 hours for DNS propagation, then test your contact form.

The form will send emails to: darrangoulding@gmail.com 