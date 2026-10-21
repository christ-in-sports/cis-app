import { attendanceAccess } from '../data';
import SummaryClient from './summary-client';

export default async function SummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, canManage } = await attendanceAccess();
  const params = await searchParams;
  const archived = params.view === 'archive';
  const { data: rows, error } = await supabase.rpc('attendance_archive_summary', { p_archived: archived });
  if (error) throw new Error('Could not load the attendance summary.');
  return <SummaryClient archived={archived} rows={rows ?? []} canManage={canManage} />;
}
