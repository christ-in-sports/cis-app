'use server';

/**
 * Registers a kid for the active season on behalf of the signed-in Parent.
 *
 * A thin wrapper around `register_kid()`. Validation here exists to give
 * readable per-field errors; the database re-enforces every rule, and stamps
 * consent itself (time and user), so nothing here can forge it.
 */

import { revalidatePath } from 'next/cache';

import { checkRole } from '@/lib/auth/roles';
import { parentRegistrationSchema } from '@/lib/validation/kid';

export interface RegisterKidResult {
  ok: boolean;
  error?: string;
  /** Dot-path -> messages, e.g. `registration.division`. */
  fieldErrors?: Record<string, string[]>;
  kidId?: string;
  registrationId?: string;
}

const FORBIDDEN = '42501';
const WAIVER = '22023';
const NO_SEASON = '55000';
const ON_TEAM = '55006';
const DUPLICATE = '23505';
const CHECK_FAILED = '23514';

export async function registerKid(input: unknown): Promise<RegisterKidResult> {
  const { supabase, userId, hasRole } = await checkRole('parent');

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!hasRole) {
    return { ok: false, error: 'Registering a kid is available to parents only.' };
  }

  const parsed = parentRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, error: 'Please fix the highlighted fields.', fieldErrors };
  }

  const { data, error } = await supabase.rpc('register_kid', {
    p_kid_id: parsed.data.mode === 'returning' ? parsed.data.kid_id : null,
    p_kid: parsed.data.kid,
    p_registration: parsed.data.registration,
    p_consent: parsed.data.consent,
  });

  if (error) {
    switch (error.code) {
      case FORBIDDEN:
        return { ok: false, error: 'That kid is not on your account.' };
      case WAIVER:
        return { ok: false, error: 'You must agree to the liability waiver.' };
      case NO_SEASON:
        return { ok: false, error: 'Registration is not open right now.' };
      case ON_TEAM:
        return {
          ok: false,
          error: 'This kid is already on a team. Contact an Admin to change the registration.',
        };
      case DUPLICATE:
        return {
          ok: false,
          error: 'You have already added a kid with that name and date of birth.',
        };
      case CHECK_FAILED:
        return {
          ok: false,
          error: 'Check the grade, division and T-shirt size and try again.',
        };
    }

    // The message can echo column values, and these are minors' records.
    console.error('register_kid failed:', error.code);
    return { ok: false, error: 'Could not save the registration.' };
  }

  const row = (data ?? [])[0] as { kid_id: string; registration_id: string } | undefined;

  revalidatePath('/register');
  revalidatePath('/registrations');

  return { ok: true, kidId: row?.kid_id, registrationId: row?.registration_id };
}
