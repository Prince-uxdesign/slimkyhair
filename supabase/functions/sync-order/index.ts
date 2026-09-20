/**
 * Slimky Hair — Order Sync to Supabase (Phase 3, Piece 1)
 *
 * Architecture today: checkout still runs its full validation/mock-payment
 * pipeline client-side (js/payment/payment-service.js) exactly as before —
 * this function is called ONCE, right after a payment is verified
 * successful, to persist the final order/items/payment into the real
 * `orders`/`order_items`/`payments` tables instead of only localStorage.
 *
 * What this function actually adds over the client-only pipeline:
 *   - `customer_id` is resolved from the caller's own verified Supabase Auth
 *     JWT, never trusted from the request body. A logged-in customer cannot
 *     submit an order object claiming to belong to (or contain the PII of)
 *     a different customer — the order's customer_email must match the
 *     JWT's own email.
 *   - Stock is deducted atomically via the `deduct_order_inventory()` SQL
 *     function (row-level locking in Postgres), a genuine second, real
 *     integrity check beyond the client-side deduction already performed.
 *   - The write happens with the service role, so it's insulated from the
 *     fact that `orders` has no client-facing INSERT policy yet (see
 *     supabase/migrations/20260920043000_core_schema.sql §10) — this
 *     function IS the authorized order-creation gateway.
 *
 * KNOWN LIMITATION (unchanged from today, not a regression): this does not
 * yet re-derive unit prices from an authoritative product/catalog table —
 * there isn't one in Supabase yet (the catalog lives in js/catalog-data.js,
 * shipped to the browser). Price trust here is exactly as strong as the
 * existing client-side validatePaymentRequest() re-check: harder to
 * casually tamper with than a raw form post, but not a real server-side
 * price recomputation. That lands with the catalog/inventory migration.
 *
 * KNOWN LIMITATION: this is called best-effort, fire-and-forget, from the
 * client after a successful payment — matching this codebase's existing
 * "email failure must never fail an already-successful order" philosophy.
 * A sync failure here does not roll back or block the customer's completed
 * checkout; it leaves the order recoverable from localStorage until synced.
 * Making this load-bearing (i.e. the checkout literally cannot complete
 * without it) is a further hardening step once this has proven reliable.
 */
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface OrderItemPayload {
  product_id: string;
  variant_id?: string | null;
  sku: string;
  product_name: string;
  variant_name?: string | null;
  product_image?: string | null;
  unit_price: number;
  quantity: number;
  line_subtotal: number;
  line_total: number;
}

interface OrderPayload {
  id: string;
  order_number: string;
  checkout_id: string;
  security_token: string;
  flow: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  country: string;
  state: string;
  city: string;
  postal_code?: string | null;
  street_address: string;
  delivery_instructions?: string | null;
  subtotal: number;
  shipping_status: string;
  shipping_amount?: number | null;
  shipping_fee?: number | null;
  product_payment_total: number;
  total_paid: number;
  currency: string;
  order_status: string;
  payment_status: string;
  latest_payment_id?: string | null;
  history?: unknown;
  metadata?: unknown;
  items: OrderItemPayload[];
}

interface PaymentPayload {
  id: string;
  provider: string;
  provider_reference: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  purpose?: string;
  customer_email: string;
  customer_phone?: string | null;
  verified_at?: string | null;
  metadata?: unknown;
}

interface RequestBody {
  order: OrderPayload;
  payment?: PaymentPayload;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { order, payment } = body;

  if (!order || !isNonEmptyString(order.id) || !isNonEmptyString(order.order_number) ||
      !isNonEmptyString(order.security_token) || !Array.isArray(order.items) || order.items.length === 0) {
    return jsonResponse({ error: 'A valid "order" (id, order_number, security_token, items) is required.' }, 400);
  }
  if (!isNonEmptyString(order.customer_email)) {
    return jsonResponse({ error: 'order.customer_email is required.' }, 400);
  }

  const admin = getAdminClient();

  // Identify the caller from their OWN Supabase session — never from the
  // request body. An anon/guest checkout has no Authorization bearer user,
  // which is the correct, expected case for guest orders.
  const authHeader = req.headers.get('Authorization') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  let authenticatedUserId: string | null = null;
  let authenticatedUserEmail: string | null = null;

  if (authHeader && supabaseUrl && anonKey) {
    try {
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await callerClient.auth.getUser();
      if (userData?.user) {
        authenticatedUserId = userData.user.id;
        authenticatedUserEmail = userData.user.email ?? null;
      }
    } catch {
      // Not a real user session (anon key alone, or an expired token) — guest checkout.
    }
  }

  let resolvedCustomerId: string | null = null;
  const isGuest = !authenticatedUserId;

  if (authenticatedUserId) {
    // Trust boundary: a signed-in customer can only sync an order under
    // their OWN email. This stops a logged-in customer from submitting an
    // order object claiming someone else's contact details as if it were
    // theirs, or attaching their session to an arbitrary order id.
    if (authenticatedUserEmail && authenticatedUserEmail.toLowerCase() !== order.customer_email.toLowerCase()) {
      return jsonResponse({ error: 'Order email does not match the authenticated account.' }, 403);
    }

    resolvedCustomerId = authenticatedUserId;
    const { error: customerUpsertError } = await admin
      .from('customers')
      .upsert(
        {
          id: authenticatedUserId,
          auth_user_id: authenticatedUserId,
          email: authenticatedUserEmail || order.customer_email,
          full_name: order.customer_name || authenticatedUserEmail || 'Customer',
          phone: order.customer_phone || null,
          status: 'active',
        },
        { onConflict: 'id', ignoreDuplicates: false },
      );
    if (customerUpsertError) {
      console.warn('[sync-order] customers upsert notice:', customerUpsertError.message);
    }
  }

  // Idempotency: if this order id already exists, this is a retry (page
  // refresh, duplicate sync call) — do not re-insert or re-deduct stock.
  const { data: existingOrder } = await admin.from('orders').select('id, order_status').eq('id', order.id).maybeSingle();
  if (existingOrder) {
    if (existingOrder.order_status === 'cancelled') {
      return jsonResponse({ success: false, error: 'INSUFFICIENT_STOCK', orderId: order.id, alreadySynced: true }, 409);
    }
    return jsonResponse({ success: true, alreadySynced: true, orderId: order.id });
  }

  const { error: orderInsertError } = await admin.from('orders').insert({
    id: order.id,
    order_number: order.order_number,
    checkout_id: order.checkout_id,
    customer_id: resolvedCustomerId,
    is_guest: isGuest,
    security_token: order.security_token,
    flow: order.flow,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    customer_phone: order.customer_phone,
    country: order.country,
    state: order.state,
    city: order.city,
    postal_code: order.postal_code ?? null,
    street_address: order.street_address,
    delivery_instructions: order.delivery_instructions ?? null,
    subtotal: order.subtotal,
    shipping_status: order.shipping_status,
    shipping_amount: order.shipping_amount ?? null,
    shipping_fee: order.shipping_fee ?? null,
    product_payment_total: order.product_payment_total,
    total_paid: order.total_paid,
    currency: order.currency,
    order_status: order.order_status,
    payment_status: order.payment_status,
    history: order.history ?? [],
    metadata: order.metadata ?? {},
  });

  if (orderInsertError) {
    if ((orderInsertError as { code?: string }).code === '23505') {
      // Postgres unique_violation on orders(id) — concurrent duplicate submission
      console.warn('[sync-order] concurrent duplicate submission detected for order:', order.id);
      return jsonResponse({ success: true, alreadySynced: true, orderId: order.id });
    }
    console.error('[sync-order] orders insert failed:', orderInsertError.message);
    return jsonResponse({ error: 'Failed to persist order.', detail: orderInsertError.message }, 500);
  }

  const itemRows = order.items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    variant_id: item.variant_id ?? null,
    sku: item.sku,
    product_name: item.product_name,
    variant_name: item.variant_name ?? null,
    product_image: item.product_image ?? null,
    unit_price: item.unit_price,
    quantity: item.quantity,
    line_subtotal: item.line_subtotal,
    line_total: item.line_total,
  }));

  const { error: itemsInsertError } = await admin.from('order_items').insert(itemRows);
  if (itemsInsertError) {
    console.error('[sync-order] order_items insert failed:', itemsInsertError.message);
    return jsonResponse({ error: 'Failed to persist order items.', detail: itemsInsertError.message }, 500);
  }

  let paymentId: string | null = null;
  if (payment && isNonEmptyString(payment.id) && isNonEmptyString(payment.provider_reference)) {
    const { error: paymentInsertError } = await admin.from('payments').insert({
      id: payment.id,
      order_id: order.id,
      provider: payment.provider,
      provider_reference: payment.provider_reference,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      status: payment.status,
      purpose: payment.purpose || 'product',
      customer_email: payment.customer_email,
      customer_phone: payment.customer_phone ?? null,
      verified_at: payment.verified_at ?? null,
      metadata: payment.metadata ?? {},
    });
    if (paymentInsertError) {
      console.warn('[sync-order] payments insert notice:', paymentInsertError.message);
    } else {
      paymentId = payment.id;
      await admin.from('orders').update({ latest_payment_id: paymentId }).eq('id', order.id);
    }
  }

  // Real, atomic, server-side stock deduction — protected by database-level
  // row-level locking (FOR UPDATE) and inventory_deductions idempotency ledger.
  try {
    const { error: deductError } = await admin.rpc('deduct_order_inventory', { p_order_id: order.id });
    if (deductError) {
      console.warn('[sync-order] stock deduction failed for order', order.id, ':', deductError.message);

      // Inventory invariant enforcement: cancel unfulfillable order and fail payment
      await admin
        .from('orders')
        .update({
          order_status: 'cancelled',
          metadata: {
            ...(order.metadata as object ?? {}),
            cancellation_reason: 'out_of_stock',
            stock_sync_error: deductError.message,
          },
        })
        .eq('id', order.id);

      if (paymentId) {
        await admin
          .from('payments')
          .update({
            status: 'failed',
            failure_reason: `Order cancelled due to insufficient inventory: ${deductError.message}`,
          })
          .eq('id', paymentId);
      }

      return jsonResponse({
        success: false,
        error: 'INSUFFICIENT_STOCK',
        orderId: order.id,
        detail: deductError.message,
      }, 409);
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[sync-order] unexpected deduction exception for order', order.id, ':', msg);

    await admin
      .from('orders')
      .update({
        order_status: 'cancelled',
        metadata: {
          ...(order.metadata as object ?? {}),
          cancellation_reason: 'out_of_stock',
          stock_sync_error: msg,
        },
      })
      .eq('id', order.id);

    return jsonResponse({
      success: false,
      error: 'INSUFFICIENT_STOCK',
      orderId: order.id,
      detail: msg,
    }, 409);
  }

  return jsonResponse({ success: true, orderId: order.id });
});

