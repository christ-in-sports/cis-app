import Link from 'next/link';
import { BoardHeader } from '@/components/cis/board-shell';
import { SheetHeading } from '@/components/cis/sheet';
import { attendanceAccess } from './data';
import { AttendanceSheet } from './parts';
import { LiveAttendance } from './live';
import { fmtDay } from '@/lib/attendance';
import AttendanceClient from './attendance-client';

export default async function AttendancePage() {
  const { supabase, canManage } = await attendanceAccess();
  const { data: season, error: seasonError } = await supabase.from('seasons').select('id, name').eq('is_current', true).maybeSingle();
  if (seasonError) throw new Error('Could not load the attendance season.');
  const { data: days, error } = season
    ? await supabase.rpc('attendance_session_overview', { p_season: season.id })
    : { data: [], error: null };
  if (error) throw new Error('Could not load attendance sessions.');
  return <>
    <LiveAttendance />
    <BoardHeader title="Attendance" kicker={season?.name ?? 'Season setup'} />
    <AttendanceSheet>
      <p className="text-cis-base text-cis-ink-muted">{canManage ? 'Set up a session, then follow attendance by team.' : 'Choose a session to take attendance for your teams.'} Results refresh every 10 seconds.</p>
      {season && canManage && <AttendanceClient seasonId={season.id} />}
      {!season && <p>Ask an Admin to start a season before creating attendance.</p>}
    </AttendanceSheet>
    <AttendanceSheet>
      <SheetHeading>Sessions</SheetHeading>
      {!days?.length && <p>No sessions yet. {canManage ? 'Create the first session above.' : 'Your program team will create a session here.'}</p>}
      {days?.map((day: { id: string; date: string; title: string; locked: boolean; total: number; present: number; unmarked: number }) => {
        return <Link key={day.id} href={`/attendance/${day.id}`} className="block border-b border-cis-rule py-4 last:border-0">
          <span className="block text-cis-md font-bold">{day.title}</span>
          <span className="block text-cis-sm text-cis-ink-muted">{fmtDay(day.date)} · {day.locked ? 'Locked' : 'Open'}</span>
          <span className="block pt-2 font-bold">{day.present} / {day.total} present · {day.unmarked} unmarked</span>
        </Link>;
      })}
    </AttendanceSheet>
  </>;
}
