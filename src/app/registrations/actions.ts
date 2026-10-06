'use server';

/**
 * The Admin's roster chores: recording that consent forms arrived, and
 * recording payments (ENG-9), against registrations that already exist.
 *
 * Thin wrappers: the timestamp and the attributed user are both derived inside
 * the database functions, so these cannot pass them in even by mistake. All
 * they do is authenticate early enough to give a readable message, validate,
 * and translate the functions' error codes.
 */

import { revalidatePath } from 'next/cache';

import { checkAdmin } from '@/lib/auth/admin';
import { recordPaymentSchema, type PaymentMethod } from '@/lib/registration/payment';

export interface ConsentRow {
  registrationId: string;
  /** Null once consent is withdrawn. */
  consentGivenAt: string | null;
}

export interface ConsentResult {
  ok: boolean;
  error?: string;
  /** The rows as they now stand, so the caller can reconcile without refetching. */
  rows?: ConsentRow[];
}

const FORBIDDEN = '42501';
const NOT_FOUND = 'P0002';
const EMPTY = '22023';

export async function setRegistrationsConsent(
  registrationIds: string[],
  received: boolean,
): Promise<ConsentResult> {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!isAdmin) {
    return { ok: false, error: 'Recording consent is available to Admins only.' };
  }
  if (registrationIds.length === 0) {
    return { ok: false, error: 'Select at least one kid first.' };
  }

  const { data, error } = await supabase.rpc('set_registrations_consent', {
    p_registration_ids: registrationIds,
    p_received: received,
  });

  if (error) {
    if (error.code === FORBIDDEN) {
      return { ok: false, error: 'Recording consent is available to Admins only.' };
    }
    if (error.code === NOT_FOUND) {
      return {
        ok: false,
        error: 'Some of those registrations no longer exist. Nothing was changed — reload and try again.',
      };
    }
    if (error.code === EMPTY) {
      return { ok: false, error: 'Select at least one kid first.' };
    }

    console.error('set_registrations_consent failed:', error.message);
    return { ok: false, error: 'Could not update consent.' };
  }

  revalidatePath('/registrations');

  const rows = (data ?? []) as Array<{
    registration_id: string;
    consent_given_at: string | null;
  }>;

  return {
    ok: true,
    rows: rows.map((row) => ({
      registrationId: row.registration_id,
      consentGivenAt: row.consent_given_at,
    })),
  };
}

export interface PaymentRow {
  id: string;
  registrationId: string;
  amountCents: number;
  method: PaymentMethod;
  receivedAt: string;
}

export interface RecordPaymentsResult {
  ok: boolean;
  error?: string;
  /** Per-field messages, keyed `amount` / `method`, for the form that sent them. */
  fieldErrors?: Partial<Record<'amount' | 'method', string>>;
  /** The payments just recorded, so the caller can reconcile without refetching. */
  payments?: PaymentRow[];
}

const CHECK_VIOLATION = '23514';

/**
 * Records the same payment -- amount and method -- against one or more
 * registrations. One kid is a list of one.
 */
export async function recordPayments(
  registrationIds: string[],
  input: { amount: string; method: string },
): Promise<RecordPaymentsResult> {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!isAdmin) {
    return { ok: false, error: 'Recording payments is available to Admins only.' };
  }
  if (registrationIds.length === 0) {
    return { ok: false, error: 'Select at least one kid first.' };
  }

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: RecordPaymentsResult['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === 'amount' || key === 'method') && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: 'Check the payment details.', fieldErrors };
  }

  const { data, error } = await supabase.rpc('record_payments', {
    p_registration_ids: registrationIds,
    p_amount_cents: parsed.data.amount,
    p_method: parsed.data.method,
  });

  if (error) {
    if (error.code === FORBIDDEN) {
      return { ok: false, error: 'Recording payments is available to Admins only.' };
    }
    if (error.code === NOT_FOUND) {
      return {
        ok: false,
        error: 'Some of those registrations no longer exist. Nothing was recorded — reload and try again.',
      };
    }
    if (error.code === EMPTY) {
      return { ok: false, error: 'Select at least one kid first.' };
    }
    // The schema mirrors the CHECKs, so this only fires if the two drift apart.
    if (error.code === CHECK_VIOLATION) {
      return { ok: false, error: 'That amount or method is not allowed.' };
    }

    console.error('record_payments failed:', error.message);
    return { ok: false, error: 'Could not record the payment.' };
  }

  revalidatePath('/registrations');

  const rows = (data ?? []) as Array<{
    payment_id: string;
    registration_id: string;
    amount_cents: number;
    method: PaymentMethod;
    received_at: string;
  }>;

  return {
    ok: true,
    payments: rows.map((row) => ({
      id: row.payment_id,
      registrationId: row.registration_id,
      amountCents: row.amount_cents,
      method: row.method,
      receivedAt: row.received_at,
    })),
  };
}

export interface DeletePaymentResult {
  ok: boolean;
  error?: string;
}

/** Removes a payment recorded by mistake. */
export async function deletePayment(paymentId: string): Promise<DeletePaymentResult> {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!isAdmin) {
    return { ok: false, error: 'Removing payments is available to Admins only.' };
  }

  const { error } = await supabase.rpc('delete_payment', { p_payment_id: paymentId });

  if (error) {
    if (error.code === FORBIDDEN) {
      return { ok: false, error: 'Removing payments is available to Admins only.' };
    }
    if (error.code === NOT_FOUND) {
      return { ok: false, error: 'That payment was already removed. Reload to see the latest.' };
    }

    console.error('delete_payment failed:', error.message);
    return { ok: false, error: 'Could not remove the payment.' };
  }

  revalidatePath('/registrations');
  return { ok: true };
}
