# Transactional Email Notifications (C20.9)

Architecture: **Storefront → Supabase Edge Function → Resend → Customer.**
`RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` exist only inside the Edge
Function runtime and are never sent to the browser.

## What's here

```
supabase/
  migrations/
    20260916120000_email_notifications.sql   # email_log idempotency/audit table
  functions/
    _shared/
      resend.ts, supabase-admin.ts, idempotency.ts, webhook-verify.ts, cors.ts
      emails/
        shared/   # layout, header, footer, button, order item row, order summary
        auth/      # registration confirmation, email verification, password reset, email change
        orders/    # order confirmation, shipping quote, shipping payment (required/confirmed), shipped, delivered
    send-transactional-email/   # generic sender the storefront calls for order + account emails
    auth-email-hook/            # Supabase Auth "Send Email" hook (signup/recovery/email_change)
    retry-failed-emails/        # scheduled sweep for anything Resend failed to deliver
```

## One-time setup

1. **Link the project** (creates/updates the real `supabase/config.toml` — merge in the
   `[functions.*]` entries from the snippet already in this folder):
   ```
   supabase link --project-ref YOUR_PROJECT_REF
   ```
2. **Apply the migration:**
   ```
   supabase db push
   ```
3. **Set Edge Function secrets** (never commit these — see root `.env.example`):
   ```
   supabase secrets set RESEND_API_KEY=re_xxx
   supabase secrets set RESEND_FROM_EMAIL=orders@yourdomain.com
   supabase secrets set RESEND_FROM_NAME="Slimky Hair"
   supabase secrets set APP_URL=https://yourdomain.com
   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them yourself.
4. **Verify your sending domain in Resend** (SPF/DKIM), then use that domain in `RESEND_FROM_EMAIL`.
5. **Deploy:**
   ```
   supabase functions deploy send-transactional-email
   supabase functions deploy auth-email-hook --no-verify-jwt
   supabase functions deploy retry-failed-emails --no-verify-jwt
   ```
6. **Enable the Auth "Send Email" hook** (Dashboard → Authentication → Hooks):
   point it at `auth-email-hook`, copy the generated `whsec_...` secret, and run:
   ```
   supabase secrets set SEND_EMAIL_HOOK_SECRET=whsec_xxx
   ```
7. **Schedule retries** (Dashboard → Database → Cron Jobs, or any external
   scheduler) to POST to `retry-failed-emails` every 15 minutes with header
   `x-cron-secret: <CRON_SECRET>`.

## Frontend wiring

`js/env.js` (gitignored — copy from `js/env.example.js`) exposes the
**public** `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the storefront so
`js/email/email-service.js` can call `send-transactional-email`. These two
values are safe to ship to the browser by design (Supabase's anon key is
access-controlled by Row Level Security, not secrecy) — `RESEND_API_KEY` and
the service role key must never appear in this file.

## Known limitation (by design, for this milestone)

Orders currently live in the browser (`localStorage`, see
`js/payment/order-store.js`) rather than in the real `orders` table, so
`send-transactional-email` renders directly from the order snapshot the
client sends rather than re-fetching an authoritative record from Postgres.
`email_log.order_id` is therefore an unenforced soft reference (no foreign
key) for audit/filtering only. Once orders are persisted server-side, add a
DB lookup + cross-check before rendering, and add the FK constraint back.

## Testing checklist (see task QA list)

Local dry run without a live Supabase project:
```
supabase functions serve send-transactional-email --env-file supabase/.env.local
curl -i http://localhost:54321/functions/v1/send-transactional-email \
  -H "Content-Type: application/json" \
  -d '{"type":"order_confirmation","recipient":"test@example.com","dedupKey":"order_confirmation:TEST-1","payload":{...}}'
```
Send the same `dedupKey` twice — the second call must return
`{"alreadySent": true}` without a second Resend request (duplicate-event
protection, requirement 9).
