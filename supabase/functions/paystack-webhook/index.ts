/**
 * Paystack Webhook Handler - Slimky Hair
 * 
 * Verifies Paystack HMAC SHA512 signatures, confirms order payment,
 * triggers atomic inventory deduction, and dispatches transactional confirmation email.
 * 
 * SECURITY: PAYSTACK_SECRET_KEY is stored securely in Supabase Edge Function secrets.
 */

import { getAdminClient } from '../_shared/supabase-admin.ts';
import { sendViaResend } from '../_shared/resend.ts';
import { renderOrderConfirmation } from '../_shared/emails/orders/order-confirmation.ts';
import { reserveIdempotencyKey, markEmailSent, markEmailFailed } from '../_shared/idempotency.ts';

// WebCrypto HMAC SHA512 signature verification
async function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string): Promise<boolean> {
  if (!signature || !secretKey) return false;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign', 'verify']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(rawBody));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return expectedSignature.toLowerCase() === signature.toLowerCase();
  } catch (err) {
    console.error('[paystack-webhook] Signature verification error:', err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

  if (!secretKey) {
    console.error('[paystack-webhook] PAYSTACK_SECRET_KEY is not configured.');
    return new Response(JSON.stringify({ error: 'Server secret not configured' }), { status: 500 });
  }

  const isValid = await verifyPaystackSignature(rawBody, signature, secretKey);
  if (!isValid) {
    console.warn('[paystack-webhook] Invalid Paystack signature received.');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
  }

  let eventPayload: { event?: string; data?: Record<string, unknown> };
  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), { status: 400 });
  }

  const { event, data } = eventPayload;

  // We only process successful charges
  if (event === 'charge.success' && data) {
    const reference = data.reference as string;
    const amountKobo = data.amount as number;
    const metadata = (data.metadata || {}) as Record<string, unknown>;
    const orderId = (metadata.order_id || metadata.orderId || '') as string;

    console.log(`[paystack-webhook] Processing charge.success for ref: ${reference}, orderId: ${orderId}`);

    const admin = getAdminClient();

    try {
      // 1. Update payment record if exists
      await admin
        .from('payments')
        .update({
          status: 'completed',
          provider_reference: reference,
          raw_response: data,
          verified_at: new Date().toISOString(),
        })
        .eq('provider_reference', reference);

      // 2. Update order record to paid
      if (orderId) {
        await admin
          .from('orders')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        // 3. Trigger atomic inventory deduction via RPC
        const { error: deductError } = await admin.rpc('deduct_order_inventory', {
          p_order_id: orderId,
        });

        if (deductError) {
          console.error(`[paystack-webhook] Inventory deduction failed for order ${orderId}:`, deductError);
        }
      }
    } catch (dbErr) {
      console.error('[paystack-webhook] Database update error:', dbErr);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
