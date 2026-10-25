import { LiveAttendance } from '../attendance/live';
import { teamsAccess } from './data';

/** The parent app layout owns BoardShell and the shared bottom navigation. */
export default async function TeamsLayout({ children }: { children: React.ReactNode }) {
  await teamsAccess();
  return <>
    <LiveAttendance />
    {children}
  </>;
}
