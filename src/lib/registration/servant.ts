/**
 * Everything the servant registration page needs, in one server-side call.
 *
 * Reads run under the servant's own session, so RLS decides what comes back:
 * the "authenticated reads current season" policy for the season and the
 * owner-only policy for `servant_registrations`. The form is the one screen a
 * roleless user can use, so nothing here may require a role. A Parent or Kid
 * account is not a servant and gets `not-servant`.
 */

import { getMyRoles } from '@/lib/auth/roles';
import type { ServantRegistrationRecord, ServantSeason } from './servant-form';

export type ServantContext =
  | { status: 'signed-out' }
  /** Holds roles, but none of them is a servant role (a Parent or Kid account). */
  | { status: 'not-servant' }
  | { status: 'no-season'; hasRole: boolean }
  | {
      status: 'ok';
      season: ServantSeason;
      /** The login email, shown read-only. */
      email: string;
      /** The user holds a role, so the form links back to the home page. */
      hasRole: boolean;
      /**
       * This season's registration, or last season's to prefill from. `null`
       * for a first-time servant.
       */
      registration: ServantRegistrationRecord | null;
      /** True when `registration` is from an earlier season and nothing is saved yet. */
      prefilled: boolean;
    };

const COLUMNS =
  'season_id, full_name, evaluation_status, is_serving, sessions, juniors_subteams, ambassadors_subteams, ' +
  'juniors_other, ambassadors_other, notes, dates_missing, phone, emergency_contact_name, ' +
  'emergency_contact_phone, gender, dob, home_address, updated_at';

export async function loadServantRegistrationContext(): Promise<ServantContext> {
  const { supabase, userId, roles } = await getMyRoles();
  if (userId === null) return { status: 'signed-out' };

  const hasRole = roles.size > 0;
  // Servants only: no role yet, or Admin, Program Team, Coach or Prayer Team. A
  // Parent or Kid account is not a servant. UX only: the database refuses the
  // same callers (`submit_servant_registration()` and the read policy).
  const isServant =
    !hasRole || roles.has('admin') || roles.has('program') || roles.has('coach') || roles.has('prayer');
  if (!isServant) return { status: 'not-servant' };

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, starts_on')
    .eq('is_current', true)
    .maybeSingle();

  if (!season) return { status: 'no-season', hasRole };

  const [{ data: rows, error }, { data: auth }] = await Promise.all([
    supabase
      .from('servant_registrations')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);

  if (error) {
    // Never log row data: it holds a DOB, an address and emergency contacts.
    console.error('loading servant registration failed:', error.code);
  }

  const all = (rows ?? []) as unknown as (ServantRegistrationRecord & { season_id: string })[];
  const current = all.find((r) => r.season_id === season.id);
  const previous = current ? undefined : all[0];
  const pick = current ?? previous;

  let registration: ServantRegistrationRecord | null = null;
  if (pick) {
    const { season_id: _omit, ...rest } = pick;
    void _omit;
    registration = rest;
  }

  return {
    status: 'ok',
    season,
    email: auth.user?.email ?? '',
    hasRole,
    registration,
    prefilled: Boolean(previous),
  };
}
