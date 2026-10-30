'use server';

/**
 * The parent join link (ENG-31, `docs/arch_decisions.md` 2026-10-25).
 *
 * One link in the parent group chat carries a shared code (`PARENT_JOIN_CODE`).
 * A parent gives their name and email, types the 6-digit code emailed to them,
 * and ends up holding the Parent role. This is the one place a role is granted
 * without an Admin, so it is deliberately narrow:
 *
 *   - every step re-checks the join code on the server, never trusting the page;
 *   - Parent is granted only after the emailed code is verified (or for someone
 *     already signed in), never from a form field;
 *   - it grants `parent` and nothing else, with the service role, and a repeat is
 *     treated as success.
 *
 * `user_roles` stays writable by Admins only. RLS is still what limits a Parent:
 * they read only the kids linked to their account and write only through
 * `register_kid()`.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkParentJoinCode } from '@/lib/auth/join-code';
import { sendJoinCodeSchema, verifyJoinCodeSchema } from '@/lib/validation/join';
import { z } from 'zod';

export interface JoinResult {
  ok: boolean;
  error?: string;
}

const WRONG_LINK = 'This link has changed. Use the latest link from the parent group chat.';
const UNAVAILABLE = 'Joining is not available right now. Please ask an Admin for help.';
const UNIQUE_VIOLATION = '23505';

/** Refuses a missing or wrong join code, slowing down guessing. Null means it is fine. */
async function refuseBadCode(code: unknown): Promise<JoinResult | null> {
  const check = checkParentJoinCode(code);
  if (check === 'ok') return null;
  if (check === 'unconfigured') return { ok: false, error: UNAVAILABLE };
  await new Promise((r) => setTimeout(r, 700));
  return { ok: false, error: WRONG_LINK };
}

/** Gives a user the Parent role. A user who already has it is fine. */
async function grantParent(userId: string): Promise<JoinResult> {
  const service = createServiceClient();
  if (!service) return { ok: false, error: UNAVAILABLE };

  const { error } = await service.from('user_roles').insert({ user_id: userId, role: 'parent' });
  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error('grantParent failed:', error.code);
    return { ok: false, error: 'We could not finish joining. Please try the link again.' };
  }
  return { ok: true };
}

const isRateLimited = (error: { status?: number; code?: string }) =>
  error.status === 429 || Boolean(error.code?.startsWith('over_'));

/** Emails a 6-digit code, creating the account if this is a new parent. */
export async function sendJoinCode(input: unknown): Promise<JoinResult> {
  const parsed = sendJoinCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check what you typed and try again.' };
  }

  const refused = await refuseBadCode(parsed.data.code);
  if (refused) return refused;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: true, data: { display_name: parsed.data.name } },
  });

  if (error) {
    if (isRateLimited(error)) {
      return { ok: false, error: 'Too many requests. Please wait a minute and try again.' };
    }
    console.error('sendJoinCode failed:', error.code);
    return { ok: false, error: 'We could not send a code. Please try again.' };
  }
  return { ok: true };
}

/** Checks the emailed code, signs the parent in, and grants Parent. */
export async function verifyJoinCode(input: unknown): Promise<JoinResult> {
  const parsed = verifyJoinCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the code and try again.' };
  }

  const refused = await refuseBadCode(parsed.data.code);
  if (refused) return refused;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'email',
  });

  if (error || !data.user) {
    return {
      ok: false,
      error:
        error && isRateLimited(error)
          ? 'Too many tries. Please wait a minute and try again.'
          : 'That code did not work. It may have expired. Check it, or send a new code.',
    };
  }

  return grantParent(data.user.id);
}

/** For someone already signed in (a servant who is also a parent): adds Parent to their account. */
export async function joinAsSignedInUser(input: unknown): Promise<JoinResult> {
  const parsed = z.object({ code: z.string() }).safeParse(input);
  const refused = await refuseBadCode(parsed.success ? parsed.data.code : undefined);
  if (refused) return refused;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out. Open the link again to sign in.' };

  return grantParent(user.id);
}
