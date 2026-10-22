'use server';

/**
 * Saves the signed-in servant's registration for the current season.
 *
 * A thin wrapper around `submit_servant_registration()`. Any signed-in user may
 * call it, because a servant has no role yet. Validation here exists to give
 * readable per-field errors; the database re-enforces every rule and takes the
 * user, season and email itself.
 *
 * The first submission of a season also sends a confirmation email. That is
 * best effort: the registration is already saved, so a mail failure is reported
 * as a soft notice, not an error.
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { sendServantConfirmation } from '@/lib/email/send-servant-confirmation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { servantRegistrationSchema } from '@/lib/validation/servant';

export interface SubmitServantResult {
  ok: boolean;
  error?: string;
  /** Dot-path -> messages, e.g. `juniors_subteams`. */
  fieldErrors?: Record<string, string[]>;
  /** True when this created the registration rather than editing it. */
  isNew?: boolean;
  /** The confirmation email could not be sent. The registration is saved. */
  emailFailed?: boolean;
}

const FORBIDDEN = '42501';
const NO_SEASON = '55000';
const CHECK_FAILED = '23514';

export async function submitServantRegistration(input: unknown): Promise<SubmitServantResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'You are no longer signed in.' };

  const parsed = servantRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
    }
    return { ok: false, error: 'Please fix the highlighted fields.', fieldErrors };
  }

  const { data, error } = await supabase.rpc('submit_servant_registration', { p: parsed.data });

  if (error) {
    switch (error.code) {
      case FORBIDDEN:
        return { ok: false, error: 'You are no longer signed in.' };
      case NO_SEASON:
        return { ok: false, error: 'Registration is not open right now.' };
      case CHECK_FAILED:
        return { ok: false, error: 'Check your session and team choices and try again.' };
    }

    // The message can echo column values (DOB, address, emergency contacts).
    console.error('submit_servant_registration failed:', error.code);
    return { ok: false, error: 'Could not save your registration.' };
  }

  const isNew = data === true;
  revalidatePath('/servant-registration');

  let emailFailed = false;
  if (isNew && user.email) {
    const { data: season } = await supabase
      .from('seasons')
      .select('name')
      .eq('is_current', true)
      .maybeSingle();

    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'https';

    const result = await sendServantConfirmation(user.email, {
      fullName: parsed.data.full_name,
      seasonName: season?.name ?? 'this season',
      registration: parsed.data,
      formUrl: `${proto}://${host}/servant-registration`,
    });
    emailFailed = result.status === 'failed';
  }

  return { ok: true, isNew, emailFailed };
}
