import { attendanceAccess, rosterRows } from '../data';
import { BoardHeader } from '@/components/cis/board-shell';
import { AttendanceSheet } from '../parts';
import TeamsClient from './teams-client';

export default async function TeamsPage() {
  const { supabase } = await attendanceAccess(true);
  const { data: seasonId, error: rosterError } = await supabase.rpc('attendance_roster_season');
  if (rosterError) throw new Error('Could not load the roster.');
  if (!seasonId) return <AttendanceSheet>Add registrations before setting up teams.</AttendanceSheet>;
  const [teams, registrations, coaches, links] = await Promise.all([
    supabase.from('ministry_teams').select('id, name, division, active').eq('season_id', seasonId).eq('active', true).order('name'),
    supabase.from('registrations').select('id, kid_id, grade, division, team_id, kids!inner(first_name, last_name)').eq('season_id', seasonId).eq('active', true),
    supabase.rpc('attendance_coach_options'),
    supabase.from('team_coaches').select('team_id, user_id'),
  ]);
  if ([teams, registrations, coaches, links].some((r) => r.error)) throw new Error('Could not load teams and assignments.');
  return <>
    <BoardHeader title="Teams & coaches" />
    <TeamsClient teams={teams.data ?? []} kids={rosterRows(registrations.data ?? [])} coaches={coaches.data ?? []} links={links.data ?? []} />
  </>;
}
