import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SummaryClient from './summary-client';

export default async function SummaryPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/attendance/summary');

  const { data: profile } = await supabase
    .from('profiles').select('is_staff, is_coach').eq('id', user.id).single();

  const isStaff = !!profile?.is_staff;
  const isCoach = isStaff || !!profile?.is_coach;
  if (!isCoach) redirect('/attendance');

  const { data: seasons } = await supabase
    .from('seasons').select('*').order('starts_on', { ascending: false });

  const current = seasons?.find((s) => s.is_current) ?? seasons?.[0] ?? null;

  const [{ data: rows }, { data: teams }, { data: days }] = await Promise.all([
    supabase.rpc('attendance_summary', { p_season: current?.id ?? null }),
    supabase.from('ministry_teams').select('id, name, session, active').order('name'),
    current
      ? supabase.from('attendance_days').select('id, date, group_id')
          .eq('season_id', current.id).order('date')
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return (
    <SummaryClient
      isStaff={isStaff}
      seasons={seasons ?? []}
      initialSeasonId={current?.id ?? null}
      initialRows={rows ?? []}
      initialDayCount={(days ?? []).length}
      teams={teams ?? []}
    />
  );
}