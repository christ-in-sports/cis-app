import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import TakeClient from './take-client';

export default async function TakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/attendance/${id}`);

  const { data: profile } = await supabase
    .from('profiles').select('is_staff, is_coach').eq('id', user.id).single();

  const isStaff = !!profile?.is_staff;
  const isCoach = isStaff || !!profile?.is_coach;
  if (!isCoach) redirect('/attendance');

  const { data: day } = await supabase
    .from('attendance_days').select('*').eq('id', id).single();
  if (!day) redirect('/attendance');

  const [{ data: group }, { data: records }, { data: teams }] = await Promise.all([
    supabase.from('attendance_groups').select('*').eq('id', day.group_id).single(),
    supabase.from('attendance_records').select('*').eq('day_id', id),
    supabase.from('ministry_teams').select('*').order('name'),
  ]);

  const ids = (records ?? []).map((r) => r.registration_id);
  const { data: kids } = ids.length
    ? await supabase
        .from('registrations')
        .select('id, first_name, last_name, grade, session, team_id')
        .in('id', ids)
    : { data: [] as any[] };

  return (
    <TakeClient
      day={day}
      groupName={group?.name ?? 'Session'}
      records={records ?? []}
      kids={kids ?? []}
      teams={teams ?? []}
      isStaff={isStaff}
      userId={user.id}
    />
  );
}