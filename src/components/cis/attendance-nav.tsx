'use client';

import { usePathname } from 'next/navigation';
import { SectionNav, type SectionNavItem } from './section-nav';

/** The same fixed icon-and-label bar used by Registration. */
export function AttendanceNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const day = pathname.match(/^\/attendance\/([0-9a-f-]{36})(?:\/codes)?$/i)?.[1];
  const dayPath = day ? `/attendance/${day}` : undefined;
  const codesPath = dayPath ? `${dayPath}/codes` : '/attendance/codes';
  const items: SectionNavItem[] = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/attendance', label: 'Attendance', icon: 'schedule', exact: true, also: dayPath && pathname === dayPath ? [dayPath] : [] },
    { href: '/attendance/codes', to: codesPath, label: 'QR codes', icon: 'qr', also: dayPath ? [`${dayPath}/codes`] : [] },
    ...(canManage ? [{ href: '/attendance/teams', label: 'Teams', icon: 'roster' as const }] : []),
    { href: '/attendance/summary', label: 'Summary', icon: 'standings', also: ['/attendance/awards'] },
    { href: '/attendance/archive', label: 'Archive', icon: 'archive' },
  ];
  return <SectionNav label="Attendance" items={items} />;
}
