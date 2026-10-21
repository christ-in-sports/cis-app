import Link from 'next/link';
import { BoardHeader } from '@/components/cis/board-shell';
import { SheetHeading } from '@/components/cis/sheet';
import { attendanceAccess } from './data';
import { AttendanceSheet } from './parts';
import { LiveAttendance } from './live';
import { fmtDay } from '@/lib/attendance';
import AttendanceClient from './attendance-client';

type Day = { id: string; date: string; title: string; locked: boolean; total: number; present: number; unmarked: number };

export async function AttendanceOverview({ archived }: { archived: boolean }) {
  const { supabase, canManage } = await attendanceAccess();
  const { data: days, error } = await supabase.rpc('attendance_days_overview', { p_archived: archived });
  if (error) throw new Error('Could not load attendance days.');
  return <>
    <LiveAttendance />
    <BoardHeader title={archived ? 'Attendance archive' : 'Attendance'} />
    <AttendanceSheet>
      <p className="text-cis-base text-cis-ink-muted">{archived ? 'Past attendance is saved here. Open a day to view its marks.' : 'Choose a day to take attendance. Changes save as you go.'}</p>
      {!archived && canManage && <AttendanceClient hasDays={!!days?.length} />}
    </AttendanceSheet>
    <AttendanceSheet>
      <SheetHeading>{archived ? 'Archived days' : 'Attendance days'}</SheetHeading>
      {!days?.length && <p>{archived ? 'No archived days yet.' : canManage ? 'No attendance days yet. Create one above.' : 'Your program team will add an attendance day here.'}</p>}
      {days?.map((day: Day) => <Link key={day.id} href={`/attendance/${day.id}`} className="block border-b border-cis-rule py-4 last:border-0">
        <span className="block text-cis-md font-bold">{fmtDay(day.date)}</span>
        {day.title !== 'Attendance' && <span className="block text-cis-sm text-cis-ink-muted">{day.title}</span>}
        <span className="block pt-2 font-bold">{day.present} / {day.total} present · {day.unmarked} unmarked</span>
      </Link>)}
    </AttendanceSheet>
  </>;
}
