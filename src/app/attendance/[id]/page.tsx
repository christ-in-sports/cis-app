import { notFound } from 'next/navigation';
import { attendanceAccess, rosterRows } from '../data';
import { embeddedOne } from '@/lib/attendance';
import TakeClient from './take-client';

export default async function TakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId, canManage, isAdmin, roles } = await attendanceAccess();
  const { data: day, error } = await supabase.from('attendance_days').select('*, attendance_groups(name)').eq('id', id).maybeSingle();
  if (error) throw new Error('Could not load attendance.');
  if (!day) notFound();
  const [records, teams, links] = await Promise.all([
    supabase.from('attendance_records').select('id, day_id, registration_id, status, method, marked_at, note').eq('day_id', id),
    supabase.from('ministry_teams').select('id, name, division, active').eq('season_id', day.season_id).order('name'),
    supabase.from('team_coaches').select('team_id').eq('user_id', userId!),
  ]);
  if ([records, teams, links].some((r) => r.error)) throw new Error('Could not load this session’s roster.');
  const ids = (records.data ?? []).map((r) => r.registration_id);
  const { data: rows, error: rosterError } = ids.length
    ? await supabase.from('registrations').select('id, kid_id, grade, division, team_id, kids!inner(first_name, last_name)').in('id', ids)
    : { data: [], error: null };
  if (rosterError) throw new Error('Could not load registered kids.');
  return <TakeClient day={day} groupName={embeddedOne(day.attendance_groups)?.name ?? 'Attendance session'}
    records={records.data ?? []} kids={rosterRows(rows ?? [])} teams={teams.data ?? []}
    myTeamIds={(links.data ?? []).map((link) => link.team_id)} canManage={canManage} isAdmin={isAdmin} isCoach={roles.has('coach')} />;
}
