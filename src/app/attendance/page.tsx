import { getMyRoles } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import AttendanceClient from './attendance-client';

export default async function AttendancePage() {
  const { supabase, userId, roles } = await getMyRoles();
  if (!userId) redirect('/login?redirect=/attendance');

  const isAdmin = roles.has('admin');
  const isCoachOrAdmin = isAdmin || roles.has('coach');

  const [{ data: groups }, { data: days }, { data: counts }] = await Promise.all([
    supabase.from('attendance_groups').select('*').eq('active', true).order('name'),
    supabase.from('attendance_days').select('*').order('date', { ascending: false }).limit(40),
    supabase.from('attendance_records').select('day_id, status'),
  ]);

  const summary: Record<string, { total: number; present: number; unmarked: number }> = {};
  (counts ?? []).forEach((r: any) => {
    const s = (summary[r.day_id] ||= { total: 0, present: 0, unmarked: 0 });
    s.total++;
    if (r.status === 'present' || r.status === 'late') s.present++;
    if (r.status === 'unmarked') s.unmarked++;
  });

  return (
    <AttendanceClient
      isAdmin={isAdmin}
      isCoachOrAdmin={isCoachOrAdmin}
      groups={groups ?? []}
      days={days ?? []}
      summary={summary}
    />
  );
}