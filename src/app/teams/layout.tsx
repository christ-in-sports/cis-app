import { BoardShell } from '@/components/cis/board-shell';
import { SectionNav } from '@/components/cis/section-nav';
import { LiveAttendance } from '../attendance/live';
import { teamsAccess } from './data';

export default async function TeamsLayout({ children }: { children: React.ReactNode }) {
  await teamsAccess();
  return <BoardShell>
    <LiveAttendance />
    {children}
    <SectionNav label="Teams" items={[
      { href: '/', label: 'Home', icon: 'home' },
      { href: '/teams', label: 'Teams', icon: 'roster' },
      { href: '/attendance', label: 'Attendance', icon: 'schedule' },
      { href: '/sports', label: 'Sports', icon: 'standings' },
    ]} />
  </BoardShell>;
}
