'use server';

/**
 * The Admin's roster chores: recording that consent forms arrived, recording
 * payments (ENG-9), and attaching a CSV-imported kid to a parent account
 * (ENG-30), against registrations that already exist.
 *
 * Thin wrappers: the timestamp and the attributed user are both derived inside
 * the database functions, so these cannot pass them in even by mistake. All
 * they do is authenticate early enough to give a readable message, validate,
 * and translate the functions' error codes.
 */

import { revalidatePath } from 'next/cache';

import { checkAdmin } from '@/lib/auth/admin';
import { recordPaymentSchema, type PaymentMethod } from '@/lib/registration/payment';
import { attachParentSchema, findParentSchema } from '@/lib/validation/attach-parent';

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

export interface ParentMatch {
  /** The profile's display name, or the email when there is none. */
  name: string;
  email: string;
}

export interface FindParentResult {
  ok: boolean;
  error?: string;
  parent?: ParentMatch;
}

type Supabase = Awaited<ReturnType<typeof checkAdmin>>['supabase'];

const NO_ACCOUNT = 'No account has that email. The parent needs to join through the parent link first.';
const NOT_A_PARENT =
  'That email has an account, but it is not a Parent. Ask them to use the parent link, or give them Parent on the Roles page.';

/**
 * Finds the account with this email among those holding Parent. Runs under the
 * Admin's own session: profiles and user_roles are readable by an Admin and by
 * no one else's lookup, which is the boundary (AGENTS.md section 4).
 */
async function resolveParent(
  supabase: Supabase,
  email: string,
): Promise<{ id: string; match: ParentMatch } | { error: string }> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('resolveParent profile lookup failed:', error.code);
    return { error: 'Could not look that email up.' };
  }
  if (!profile) return { error: NO_ACCOUNT };

  const { data: role, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', profile.id)
    .eq('role', 'parent')
    .maybeSingle();

  if (roleError) {
    console.error('resolveParent role lookup failed:', roleError.code);
    return { error: 'Could not look that email up.' };
  }
  if (!role) return { error: NOT_A_PARENT };

  return {
    id: profile.id,
    match: { name: profile.display_name?.trim() || email, email },
  };
}

/** Step one: who is this email? The Admin confirms the answer before anything is written. */
export async function findParentByEmail(email: string): Promise<FindParentResult> {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!isAdmin) {
    return { ok: false, error: 'Attaching a kid to a parent is available to Admins only.' };
  }

  const parsed = findParentSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter a valid email address' };
  }

  const found = await resolveParent(supabase, parsed.data.email);
  if ('error' in found) return { ok: false, error: found.error };
  return { ok: true, parent: found.match };
}

export interface AttachKidResult {
  ok: boolean;
  error?: string;
  parent?: ParentMatch;
}

/**
 * Step two: attach one kid to that parent. Looks the email up again rather than
 * taking an account id from the browser, and only fills an empty
 * `parent_user_id`, so a kid who already has a parent is never moved. The write
 * is the existing `"admin manage kids"` policy (`has_role('admin')`); a
 * non-Admin's update matches no row.
 *
 * A parent attached here sees the kid's address, emergency contact, photo and
 * payments, so this is deliberately the only place a kid is given to a parent
 * (the app never links by matching an email, ENG-29).
 */
export async function attachKidToParent(input: { kidId: string; email: string }): Promise<AttachKidResult> {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!isAdmin) {
    return { ok: false, error: 'Attaching a kid to a parent is available to Admins only.' };
  }

  const parsed = attachParentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the kid and the email.' };
  }

  const found = await resolveParent(supabase, parsed.data.email);
  if ('error' in found) return { ok: false, error: found.error };

  const { data, error } = await supabase
    .from('kids')
    .update({ parent_user_id: found.id })
    .eq('id', parsed.data.kidId)
    .is('parent_user_id', null)
    .select('id');

  if (error) {
    console.error('attachKidToParent failed:', error.code);
    return { ok: false, error: 'Could not attach the kid.' };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'That kid already has a parent, or no longer exists. Reload to see the latest.',
    };
  }

  revalidatePath('/registrations');
  revalidatePath('/register');
  return { ok: true, parent: found.match };
}
