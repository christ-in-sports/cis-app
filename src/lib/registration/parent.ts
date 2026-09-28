/**
 * Everything the parent registration page needs, in one server-side call.
 *
 * Kept out of the page so the (later) UI stays a thin consumer and this can be
 * tested and reused. Reads run under the parent's own session, so RLS decides
 * what comes back -- `can_read_kid()` for kids and registrations, and the
 * "parents read current season" policy for the season.
 */

import { checkRole } from '@/lib/auth/roles';

export interface ParentKid {
  id: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: 'male' | 'female';
  email: string | null;
  phone: string | null;
  allergies: string | null;
  home_address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  /** This season's registration, if the kid already has one. */
  registration: {
    id: string;
    grade: number;
    division: 'juniors' | 'ambassadors';
    tshirt_size: string;
    top_sports: string[] | null;
    /** Set once an Admin places the kid; the parent can no longer edit. */
    on_team: boolean;
    consent_given_at: string | null;
  } | null;
}

export type ParentContext =
  | { status: 'signed-out' }
  | { status: 'forbidden' }
  | { status: 'no-season' }
  | {
      status: 'ok';
      season: { id: string; name: string };
      kids: ParentKid[];
    };

export async function loadParentRegistrationContext(): Promise<ParentContext> {
  const { supabase, userId, hasRole } = await checkRole('parent');

  if (userId === null) return { status: 'signed-out' };
  if (!hasRole) return { status: 'forbidden' };

  // Attach kids that CSV import left unlinked, before reading "my kids".
  // Best-effort: a failure here must not stop a parent registering a new kid.
  const { error: linkError } = await supabase.rpc('link_my_kids');
  if (linkError) console.error('link_my_kids failed:', linkError.message);

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .maybeSingle();

  if (!season) return { status: 'no-season' };

  const { data: kids, error } = await supabase
    .from('kids')
    .select(
      `id, first_name, last_name, dob, gender, email, phone, allergies,
       home_address, emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email,
       registrations ( id, season_id, grade, division, tshirt_size, top_sports,
                       team_id, consent_given_at )`,
    )
    .eq('parent_user_id', userId)
    .order('first_name');

  if (error) {
    // Never include row data in logs -- these are minors' records.
    console.error('loading parent kids failed:', error.message);
    return { status: 'ok', season, kids: [] };
  }

  return {
    status: 'ok',
    season,
    kids: (kids ?? []).map((k) => {
      const reg = (k.registrations ?? []).find((r) => r.season_id === season.id) ?? null;
      const { registrations: _omit, ...kid } = k;
      void _omit;
      return {
        ...(kid as Omit<ParentKid, 'registration'>),
        registration: reg
          ? {
              id: reg.id,
              grade: reg.grade,
              division: reg.division as 'juniors' | 'ambassadors',
              tshirt_size: reg.tshirt_size,
              top_sports: reg.top_sports,
              on_team: reg.team_id !== null,
              consent_given_at: reg.consent_given_at,
            }
          : null,
      };
    }),
  };
}
