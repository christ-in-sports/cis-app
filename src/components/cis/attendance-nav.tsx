'use client';

import { usePathname } from 'next/navigation';
import type { SectionNavItem } from './section-nav';
import { SectionTabs } from './section-tabs';

/** The Attendance section's tabs, at the top of the board like Sports' and Registration's. */
export function AttendanceNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const day = pathname.match(/^\/attendance\/([0-9a-f-]{36})(?:\/codes)?$/i)?.[1];
  const dayPath = day ? `/attendance/${day}` : undefined;
  const codesPath = dayPath ? `${dayPath}/codes` : '/attendance/codes';
  const items: SectionNavItem[] = [
    { href: '/attendance', label: 'Days', exact: true, also: dayPath && pathname === dayPath ? [dayPath] : [] },
    { href: '/attendance/codes', to: codesPath, label: 'QR codes', also: dayPath ? [`${dayPath}/codes`] : [] },
    ...(canManage ? [{ href: '/teams', label: 'Teams' }] : []),
    { href: '/attendance/summary', label: 'Summary', also: ['/attendance/awards'] },
    { href: '/attendance/archive', label: 'Archive' },
  ];
  return <SectionTabs label="Attendance" items={items} />;
}
