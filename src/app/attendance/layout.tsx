import { AttendanceNav } from '@/components/cis/attendance-nav';
import { BoardShell } from '@/components/cis/board-shell';
import { redirectIfRoleless } from '@/lib/auth/servant-gate';
import { attendanceAccess } from './data';

export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  // A servant with no role yet goes straight to the registration form, rather
  // than being turned away to the home page first.
  await redirectIfRoleless();
  const { canManage } = await attendanceAccess();
  return <BoardShell>
    {children}
    <AttendanceNav canManage={canManage} />
  </BoardShell>;
}
