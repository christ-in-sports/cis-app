import { getMyRoles } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import SummaryClient from './summary-client';

export default async function SummaryPage() {
  const { supabase, userId, roles } = await getMyRoles();
  if (!userId) redirect('/login?redirect=/attendance/summary');

  const isAdmin = roles.has('admin');
  if (!isAdmin && !roles.has('coach')) redirect('/attendance');

  const { data: seasons } = await supabase
    .from('seasons').select('*').order('starts_on', { ascending: false });

  const current = seasons?.find((s) => s.is_current) ?? seasons?.[0] ?? null;

  const [{ data: rows }, { data: teams }, { data: days }] = await Promise.all([
    supabase.rpc('attendance_summary', { p_season: current?.id ?? null }),
    supabase.from('ministry_teams').select('id, name, division, active').order('name'),
    current
      ? supabase.from('attendance_days').select('id, date, group_id')
          .eq('season_id', current.id).order('date')
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return (
    <SummaryClient
      isAdmin={isAdmin}
      seasons={seasons ?? []}
      initialSeasonId={current?.id ?? null}
      initialRows={rows ?? []}
      initialDayCount={(days ?? []).length}
      teams={teams ?? []}
    />
  );
}