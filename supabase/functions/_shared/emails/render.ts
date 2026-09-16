/**
 * Single dispatch point mapping an email_type to its renderer.
 * Used by both send-transactional-email (first send) and retry-failed-emails
 * (re-send from the stored payload_snapshot), so there is exactly one
 * template implementation per email — never two designs for the same email.
 */
import { renderRegistrationConfirmation } from './auth/registration-confirmation.ts';
import { renderEmailVerification } from './auth/email-verification.ts';
import { renderPasswordReset } from './auth/password-reset.ts';
import { renderEmailChangeConfirmation } from './auth/email-change-confirmation.ts';
import { renderOrderConfirmation } from './orders/order-confirmation.ts';
import { renderShippingQuote } from './orders/shipping-quote.ts';
import { renderShippingPaymentRequired } from './orders/shipping-payment-required.ts';
import { renderShippingPaymentConfirmed } from './orders/shipping-payment-confirmed.ts';
import { renderOrderShipped } from './orders/order-shipped.ts';
import { renderOrderDelivered } from './orders/order-delivered.ts';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// deno-lint-ignore no-explicit-any
type Renderer = (payload: any) => RenderedEmail;

const RENDERERS: Record<string, Renderer> = {
  registration_confirmation: renderRegistrationConfirmation,
  email_verification: renderEmailVerification,
  password_reset: renderPasswordReset,
  email_change_confirmation: renderEmailChangeConfirmation,
  order_confirmation: renderOrderConfirmation,
  shipping_quote: renderShippingQuote,
  shipping_payment_required: renderShippingPaymentRequired,
  shipping_payment_confirmed: renderShippingPaymentConfirmed,
  order_shipped: renderOrderShipped,
  order_delivered: renderOrderDelivered,
};

export const KNOWN_EMAIL_TYPES = Object.keys(RENDERERS);

export function renderEmail(type: string, payload: unknown): RenderedEmail {
  const renderer = RENDERERS[type];
  if (!renderer) {
    throw new Error(`Unknown email type: "${type}". Expected one of: ${KNOWN_EMAIL_TYPES.join(', ')}`);
  }
  return renderer(payload);
}
