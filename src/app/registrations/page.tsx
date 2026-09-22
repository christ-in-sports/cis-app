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
      season={season ?? null}
    />
  );
}
