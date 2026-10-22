import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BoardHeader } from '@/components/cis/board-shell';
import { attendanceAccess } from '../data';
import { AttendanceSheet } from '../parts';

/** Stable bottom-nav destination when no attendance day is selected. */
export default async function AttendanceCodesIndex() {
  const { supabase } = await attendanceAccess();
  const { data: days, error } = await supabase.rpc('attendance_days_overview', { p_archived: false });
  if (error) throw new Error('Could not load QR card rosters.');
  // The existing overview is newest-first, with counts scoped to the caller.
  const latest = (days as { id: string; total: number }[] | null)?.find((day) => Number(day.total) > 0);
  if (latest) redirect(`/attendance/${latest.id}/codes`);
  return <>
    <BoardHeader title="Attendance QR cards" />
    <AttendanceSheet>
      <p>No current attendance roster is available to print. Open an attendance day with kids on your accessible roster to view their QR cards.</p>
      <Link href="/attendance" className="inline-flex min-h-11 items-center font-bold underline">Go to attendance</Link>
    </AttendanceSheet>
  </>;
}
