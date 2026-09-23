'use server';

/**
 * Records that parents' consent forms arrived, against registrations that
 * already exist.
 *
 * A thin wrapper: the timestamp and the attributed user are both derived inside
 * `set_registrations_consent()`, so this cannot pass them in even by mistake.
 * All it does is authenticate early enough to give a readable message, and
 * translate the function's error codes.
 */

import { revalidatePath } from 'next/cache';

import { checkAdmin } from '@/lib/auth/admin';

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
