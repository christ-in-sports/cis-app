import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { embeddedOne, type RosterKid } from '@/lib/attendance';
import TeamsClient from './teams-client';

export default async function TeamsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/attendance/teams');

  const { data: profile } = await supabase
    .from('profiles').select('is_staff').eq('id', user.id).single();

  const [{ data: teams }, { data: rows }, { data: coaches }, { data: links }] =
    await Promise.all([
      supabase.from('ministry_teams').select('id, name, session, active').order('name'),
      // Identity lives on `kids`, per-season fields on `registrations`; the roster
      // is the join of the two, flattened below into RosterKid.
      supabase.from('registrations')
        .select('id, kid_id, grade, division, team_id, kids!inner(first_name, last_name)')
        .eq('active', true)
        .order('last_name', { referencedTable: 'kids' }),
      supabase.from('profiles')
        .select('id, display_name, email')
        .or('is_coach.eq.true,is_staff.eq.true')
        .order('display_name'),
      supabase.from('team_coaches').select('team_id, user_id'),
    ]);

  const kids: RosterKid[] = (rows ?? []).flatMap((r) => {
    const kid = embeddedOne(r.kids);
    if (!kid) return [];
    return [{
      id: r.id,
      kid_id: r.kid_id,
      first_name: kid.first_name,
      last_name: kid.last_name,
      grade: r.grade,
      division: r.division,
      team_id: r.team_id,
    }];
  });

  return (
    <TeamsClient
      isStaff={!!profile?.is_staff}
      teams={teams ?? []}
      kids={kids}
      coaches={coaches ?? []}
      links={links ?? []}
    />
  );
}