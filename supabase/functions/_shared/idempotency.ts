/**
 * Idempotency ledger for outgoing transactional emails (Milestone C20.9).
 *
 * Guards against duplicate sends caused by page refreshes, payment retries,
 * webhook retries, or duplicate provider events: the atomic INSERT below
 * relies on the UNIQUE constraint on email_log.idempotency_key, so concurrent
 * requests for the same key can only ever reserve the row once.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ReserveParams {
  idempotencyKey: string;
  emailType: string;
  recipient: string;
  subject: string;
  orderId?: string | null;
  payloadSnapshot: unknown;
}

export type ReserveResult =
  | { reserved: true; id: number }
  | { reserved: false; alreadyExists: true };

const UNIQUE_VIOLATION = '23505';

export async function reserveIdempotencyKey(
  admin: SupabaseClient,
  params: ReserveParams,
): Promise<ReserveResult> {
  const { data, error } = await admin
    .from('email_log')
    .insert({
      idempotency_key: params.idempotencyKey,
      email_type: params.emailType,
      recipient: params.recipient,
      subject: params.subject,
      order_id: params.orderId ?? null,
      status: 'pending',
      payload_snapshot: params.payloadSnapshot ?? {},
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { reserved: false, alreadyExists: true };
    }
    throw error;
  }

  return { reserved: true, id: data.id as number };
}

export async function markEmailSent(admin: SupabaseClient, id: number, providerMessageId: string): Promise<void> {
  const { error } = await admin.rpc('mark_email_log_sent', {
    p_id: id,
    p_provider_message_id: providerMessageId,
  });
  if (error) throw error;
}

export async function markEmailFailed(admin: SupabaseClient, id: number, errorMessage: string): Promise<void> {
  const { error } = await admin.rpc('mark_email_log_failed', {
    p_id: id,
    p_error: errorMessage.slice(0, 2000),
  });
  if (error) throw error;
}
