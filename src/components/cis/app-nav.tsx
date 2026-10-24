'use client';

/**
 * `AppNav`: the one bottom bar, the same on every screen inside the app shell
 * (`app/(app)/layout.tsx`). Which items it has depends on the viewer's roles,
 * because a tab that leads to a screen you may not use is a dead end:
 *   - everyone with a role gets Today, Sports and More;
 *   - Admin, Program Team and Coaches also get attendance -- "Attendance" for
 *     those who manage it, "My team" for a Coach who only marks their own.
 * Faith joins between attendance and More once the spiritual module ships.
 *
 * Pages that are not their own tab (the roster, servants, roles, import, the
 * parent's Register form) keep More lit, because More is where they are reached.
 * This only decides what is offered; every page checks its own access and RLS is
 * the boundary.
 */

import { SectionNav, type SectionNavItem } from '@/components/cis/section-nav';
import type { AppRole } from '@/lib/auth/app-roles';

export function appNavItems(roles: ReadonlySet<AppRole>): SectionNavItem[] {
  const manages = roles.has('admin') || roles.has('program');
  const coaches = roles.has('coach');
  return [
    { href: '/', label: 'Today', icon: 'today' },
    { href: '/sports', label: 'Sports', icon: 'sports' },
    ...(manages || coaches
      ? [{ href: '/attendance', label: manages ? 'Attendance' : 'My team', icon: 'attendance' as const }]
      : []),
    {
      href: '/more',
      label: 'More',
      icon: 'more',
      also: ['/registrations', '/register', '/servants', '/admin'],
    },
  ];
}

export function AppNav({ roles }: { roles: readonly AppRole[] }) {
  return <SectionNav label="App" items={appNavItems(new Set(roles))} />;
}
