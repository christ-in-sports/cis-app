import { attendanceAccess, rosterRows } from '../data';
import { awardsRoster } from '@/lib/attendance-awards';
import AwardsClient from './awards-client';

export default async function AwardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await attendanceAccess(true);
  const archived = (await searchParams).view === 'archive';
  const { data: seasonId, error: rosterError } = await supabase.rpc('attendance_roster_season');
  if (rosterError) throw new Error('Could not load the registered roster.');
  if (!seasonId) return <AwardsClient archived={archived} rows={[]} />;
  const [registrations, teams, summary] = await Promise.all([
    supabase.from('registrations').select('id, kid_id, grade, division, team_id, kids!inner(first_name, last_name)').eq('season_id', seasonId).eq('active', true),
    supabase.from('ministry_teams').select('id, name, division, active').eq('season_id', seasonId),
    supabase.rpc('attendance_archive_summary', { p_archived: archived }),
  ]);
  if ([registrations, teams, summary].some((result) => result.error)) throw new Error('Could not load attendance awards.');
  return <AwardsClient archived={archived} rows={awardsRoster(rosterRows(registrations.data ?? []), teams.data ?? [], summary.data ?? [])} />;
}
