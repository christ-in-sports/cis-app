import { getMyRoles } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import { embeddedOne, type RosterKid } from '@/lib/attendance';
import TeamsClient from './teams-client';

export default async function TeamsPage() {
  const { supabase, userId, roles } = await getMyRoles();
  if (!userId) redirect('/login?redirect=/attendance/teams');

  const isAdmin = roles.has('admin');

  // Coach picker: everyone holding the Coach or Admin role. `user_roles` is
  // readable in full by an Admin, which is the only role this screen is for.
  const { data: coachRoles } = isAdmin
    ? await supabase.from('user_roles').select('user_id').in('role', ['coach', 'admin'])
    : { data: [] as { user_id: string }[] };
  const coachIds = [...new Set((coachRoles ?? []).map((r) => r.user_id))];

  const [{ data: teams }, { data: rows }, { data: coaches }, { data: links }] =
    await Promise.all([
      supabase.from('ministry_teams').select('id, name, division, active').order('name'),
      // Identity lives on `kids`, per-season fields on `registrations`; the roster
      // is the join of the two, flattened below into RosterKid.
      supabase.from('registrations')
        .select('id, kid_id, grade, division, team_id, kids!inner(first_name, last_name)')
        .eq('active', true)
        .order('last_name', { referencedTable: 'kids' }),
      coachIds.length
        ? supabase.from('profiles')
            .select('id, display_name, email')
            .in('id', coachIds)
            .order('display_name')
        : Promise.resolve({ data: [] as { id: string; display_name: string | null; email: string | null }[] }),
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
      isAdmin={isAdmin}
      teams={teams ?? []}
      kids={kids}
      coaches={coaches ?? []}
      links={links ?? []}
    />
  );
}