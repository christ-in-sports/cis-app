import { rosterRows } from '../attendance/data';
import { teamsAccess, currentTeamSeason } from './data';
import { BoardHeader } from '@/components/cis/board-shell';
import { AttendanceSheet } from '../attendance/parts';
import { loadKidPhotos } from '@/lib/photo/signed-urls';
import TeamsClient from './teams-client';
import type { MinistryTeam, RosterKid } from '@/lib/attendance';

export default async function TeamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await teamsAccess();
  const archived = (await searchParams).view === 'archive';
  const season = await currentTeamSeason(supabase);
  const seasonId = season?.id;
  if (!seasonId && !archived) return <><BoardHeader title="Teams" /><AttendanceSheet>Set up a current season before creating teams.</AttendanceSheet></>;
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
    const kids = rosterRows(data ?? []);
    const photos = await loadKidPhotos(supabase, kids.map((k) => k.kid_id));
    return kids.map((k) => ({ ...k, photo: photos.get(k.kid_id) ?? null }));
  };
  const [teams, registrations, coaches, links] = await Promise.all([
    loadTeams(),
    loadRoster(),
    supabase.rpc('attendance_coach_options'),
    supabase.from('team_coaches').select('team_id, user_id'),
  ]);
  if ([coaches, links].some((r) => r.error)) throw new Error('Could not load teams and assignments.');
  return <>
    <BoardHeader title={archived ? 'Archived teams' : 'Teams'} />
    {!archived && <AttendanceSheet><p>{season?.name} · Teams and assignments are shared with Attendance and Sports.</p></AttendanceSheet>}
    <TeamsClient key={archived ? 'archive' : seasonId} archived={archived} teams={teams} kids={registrations} coaches={coaches.data ?? []} links={links.data ?? []} />
  </>;
}
