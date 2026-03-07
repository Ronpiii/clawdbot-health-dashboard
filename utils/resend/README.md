# Resend Email Utility

Standalone email sending via [Resend](https://resend.com). Extracted from Anivia, actively used by ventok.eu contact form.

## Quick Start

### Node.js / TypeScript

```bash
npm install resend
```

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: "Your App <noreply@yourdomain.com>",
  to: ["recipient@example.com"],
  subject: "Hello",
  html: "<p>Hello world</p>",
});
```

### PHP (curl)

```php
$payload = json_encode([
    'from' => 'Your App <noreply@yourdomain.com>',
    'to' => ['recipient@example.com'],
    'reply_to' => $replyToEmail,  // optional
    'subject' => 'Hello',
    'html' => '<p>Hello world</p>',
]);

$ch = curl_init('https://api.resend.com/emails');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
```

### Shell (curl)

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Your App <noreply@yourdomain.com>",
    "to": ["recipient@example.com"],
    "subject": "Hello",
    "html": "<p>Hello world</p>"
  }'
```

## Configuration

| Env Var | Description |
|---------|-------------|
| `RESEND_API_KEY` | Your Resend API key (starts with `re_`) |
| `EMAIL_FROM` | Default from address (must be verified domain) |

## Domain Setup

1. Add domain in Resend dashboard
2. Add DNS records (DKIM, SPF, DMARC)
3. Wait for verification (~5 min)
4. Use `noreply@yourdomain.com` as from address

## Patterns

### Contact Form (PHP)

See `examples/contact-form.php` — includes:
- Rate limiting (3 requests / 5 min per IP)
- Input validation
- Honeypot spam protection
- HTML email template
- Error handling

### Transactional Emails (TypeScript)

See `examples/transactional.ts` — includes:
- React Email templates
- Typed send functions
- Error handling wrapper

## Live Usage

- **ventok.eu**: `/api/contact.php` → sends to ronald@ventok.eu
- **anivia** (shelved): daily summaries, AI alerts, lead response notifications

## Links

- [Resend Docs](https://resend.com/docs)
- [React Email](https://react.email) — for building templates
- [Resend Dashboard](https://resend.com/emails)
