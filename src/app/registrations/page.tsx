import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { embeddedOne } from '@/lib/attendance';
import RegistrationsClient, { type RosterEntry } from './registrations-client';

export default async function RegistrationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/registrations');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_staff')
    .eq('id', user.id)
    .single();

  const isStaff = !!profile?.is_staff;

  // Deliberately NOT `isStaff`. That reads the legacy `profiles.is_staff`
  // column, which the signup flow still writes; the roles migration made
  // `has_role('admin')` the real thing, and /admin/imports checks exactly that.
  // Gating the import link on the column would offer it to someone the import
  // page then redirects away -- or hide it from an Admin who can use it.
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  const isAdmin = adminRole !== null;

  // A roster row is a kid plus their registration for the active season. The
  // season has to be resolved first because registrations are per-season now.
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .maybeSingle();

  const { data: rows } = season
    ? await supabase
        .from('registrations')
        .select(
          `id, kid_id, grade, division, tshirt_size, top_sports, active,
           consent_given_at, team_id,
           kids!inner(
             id, first_name, last_name, dob, gender, allergies, home_address,
             email, phone, emergency_contact_name, emergency_contact_phone,
             guardian_name, guardian_phone, guardian_email
           )`
        )
        .eq('season_id', season.id)
        .order('last_name', { referencedTable: 'kids' })
    : { data: [] };

  const entries: RosterEntry[] = (rows ?? []).flatMap((r) => {
    const kid = embeddedOne(r.kids);
    if (!kid) return [];
    return [{
      registration_id: r.id,
      grade: r.grade,
      division: r.division,
      tshirt_size: r.tshirt_size,
      top_sports: r.top_sports,
      active: r.active,
      consent_given_at: r.consent_given_at,
      team_id: r.team_id,
      kid,
    }];
  });

  return (
    <RegistrationsClient
      initial={entries}
      isStaff={isStaff}
      isAdmin={isAdmin}
      season={season ?? null}
    />
  );
}
