import { getMyRoles } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import { embeddedOne, type RosterKid } from '@/lib/attendance';
import TakeClient from './take-client';

export default async function TakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId, roles } = await getMyRoles();
  if (!userId) redirect(`/login?redirect=/attendance/${id}`);

  const isAdmin = roles.has('admin');
  if (!isAdmin && !roles.has('coach')) redirect('/attendance');

  const { data: day } = await supabase
    .from('attendance_days').select('*').eq('id', id).single();
  if (!day) redirect('/attendance');

  const [{ data: group }, { data: records }, { data: teams }, { data: myLinks }] =
    await Promise.all([
      supabase.from('attendance_groups').select('*').eq('id', day.group_id).single(),
      supabase.from('attendance_records').select('*').eq('day_id', id),
      supabase.from('ministry_teams').select('id, name, division, active').order('name'),
      supabase.from('team_coaches').select('team_id').eq('user_id', userId),
    ]);

  const ids = (records ?? []).map((r) => r.registration_id);
  const { data: rows } = ids.length
    ? await supabase
        .from('registrations')
        .select('id, kid_id, grade, division, team_id, kids!inner(first_name, last_name)')
        .in('id', ids)
    : { data: [] };

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
    <TakeClient
      day={day}
      groupName={group?.name ?? 'Session'}
      records={records ?? []}
      kids={kids}
      teams={teams ?? []}
      myTeamIds={(myLinks ?? []).map((l) => l.team_id)}
      isAdmin={isAdmin}
      userId={userId}
    />
  );
}