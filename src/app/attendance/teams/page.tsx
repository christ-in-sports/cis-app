import { attendanceAccess, rosterRows } from '../data';
import { BoardHeader } from '@/components/cis/board-shell';
import { AttendanceSheet } from '../parts';
import TeamsClient from './teams-client';
import type { MinistryTeam, RosterKid } from '@/lib/attendance';

export default async function TeamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await attendanceAccess(true);
  const archived = (await searchParams).view === 'archive';
  const { data: seasonId, error: rosterError } = await supabase.rpc('attendance_roster_season');
  if (rosterError) throw new Error('Could not load the roster.');
  if (!seasonId && !archived) return <AttendanceSheet>Add registrations before setting up teams.</AttendanceSheet>;
  const loadTeams = async (): Promise<MinistryTeam[]> => {
    let query = supabase.from('ministry_teams').select('id, name, division, active, archived_at');
    query = archived ? query.not('archived_at', 'is', null).order('archived_at', { ascending: false }) : query.eq('season_id', seasonId).eq('active', true);
    const { data, error } = await query.order('name');
    if (error) throw new Error('Could not load teams.');
    return (data ?? []) as MinistryTeam[];
  };
  const loadRoster = async (): Promise<RosterKid[]> => {
    if (archived) {
      const { data, error } = await supabase.rpc('archived_attendance_team_roster');
      if (error) throw new Error('Could not load archived team rosters.');
      return (data ?? []) as RosterKid[];
    }
    const { data, error } = await supabase.from('registrations').select('id, kid_id, grade, division, team_id, kids!inner(first_name, last_name)').eq('season_id', seasonId).eq('active', true);
    if (error) throw new Error('Could not load registered kids.');
    return rosterRows(data ?? []);
  };
  const [teams, registrations, coaches, links] = await Promise.all([
    loadTeams(),
    loadRoster(),
    supabase.rpc('attendance_coach_options'),
    supabase.from('team_coaches').select('team_id, user_id'),
  ]);
  if ([coaches, links].some((r) => r.error)) throw new Error('Could not load teams and assignments.');
  return <>
    <BoardHeader title={archived ? 'Archived teams' : 'Teams & coaches'} />
    <TeamsClient archived={archived} teams={teams} kids={registrations} coaches={coaches.data ?? []} links={links.data ?? []} />
  </>;
}
