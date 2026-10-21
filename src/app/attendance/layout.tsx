import { AttendanceNav } from '@/components/cis/attendance-nav';
import { BoardShell } from '@/components/cis/board-shell';
import { attendanceAccess } from './data';

export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const { canManage } = await attendanceAccess();
  return <BoardShell>
    {children}
    <AttendanceNav canManage={canManage} />
  </BoardShell>;
}
