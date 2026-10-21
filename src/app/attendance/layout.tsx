import Link from 'next/link';
import { BoardShell } from '@/components/cis/board-shell';
import { attendanceAccess } from './data';

export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const { canManage } = await attendanceAccess();
  return <BoardShell>
    <nav aria-label="Attendance navigation" className="flex flex-wrap gap-4 px-6 py-3 text-cis-base font-bold">
      <Link href="/">Home</Link><Link href="/attendance">Sessions</Link>
      {canManage && <Link href="/attendance/teams">Teams</Link>}
      <Link href="/attendance/summary">Summary</Link>
    </nav>
    {children}
  </BoardShell>;
}
