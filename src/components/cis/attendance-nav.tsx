'use client';

import { usePathname } from 'next/navigation';
import { SectionNav, type SectionNavItem } from './section-nav';

/** The same fixed icon-and-label bar used by Registration. */
export function AttendanceNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const detail = /^\/attendance\/[^/]+$/.test(pathname) && !['/attendance/teams', '/attendance/summary', '/attendance/archive', '/attendance/awards'].includes(pathname);
  const items: SectionNavItem[] = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/attendance', label: 'Attendance', icon: 'schedule', exact: true, also: detail ? [pathname] : [] },
    ...(canManage ? [{ href: '/attendance/teams', label: 'Teams', icon: 'roster' as const }] : []),
    { href: '/attendance/summary', label: 'Summary', icon: 'standings', also: ['/attendance/awards'] },
    { href: '/attendance/archive', label: 'Archive', icon: 'archive' },
  ];
  return <SectionNav label="Attendance" items={items} />;
}
