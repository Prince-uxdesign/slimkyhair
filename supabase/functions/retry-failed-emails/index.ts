/**
 * Retry sweep for failed transactional emails (Milestone C20.9, requirement 8).
 *
 * Invoke on a schedule (Supabase Dashboard -> Database -> Cron Jobs, or any
 * external scheduler) with header `x-cron-secret: <CRON_SECRET>`. Re-renders
 * each failed email from its stored payload_snapshot (single source of truth
 * in _shared/emails/render.ts) and attempts to resend via Resend, capping
 * attempts so a permanently-broken recipient doesn't retry forever.
 */
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { markEmailFailed, markEmailSent } from '../_shared/idempotency.ts';
import { sendViaResend } from '../_shared/resend.ts';
import { renderEmail } from '../_shared/emails/render.ts';
import { timingSafeEqual } from '../_shared/webhook-verify.ts';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  const suppliedSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || !suppliedSecret || !timingSafeEqual(suppliedSecret, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const admin = getAdminClient();

  const { data: rows, error } = await admin
    .from('email_log')
    .select('id, email_type, recipient, order_id, payload_snapshot, attempts')
    .eq('status', 'failed')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let succeeded = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    try {
      const rendered = renderEmail(row.email_type, row.payload_snapshot);
      const { messageId } = await sendViaResend({
        to: row.recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      await markEmailSent(admin, row.id, messageId);
      succeeded += 1;
    } catch (err) {
      await markEmailFailed(admin, row.id, (err as Error).message);
      failed += 1;
    }
  }

  return new Response(
    JSON.stringify({ retried: rows?.length ?? 0, succeeded, failed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
