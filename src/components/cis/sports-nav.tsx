'use client';

/**
 * `SportsNav`, from the Sports components (`DESIGN_SYSTEM.md` §7).
 *
 * Entering Sports swaps the bottom nav to Home / Standings / Schedule / Bracket,
 * with Manage added for Admin and Program Team. "Home" goes back to the app.
 * The bar itself is `SectionNav`, shared with the Registration section; this
 * only says which items Sports has.
 *
 * The global set proposed alongside these designs (Today / Sports / Calendar /
 * Team) is not agreed and is not built; this is the in-section nav only.
 */

import { SectionNav, type SectionNavItem } from '@/components/cis/section-nav';

const ITEMS: SectionNavItem[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/sports', label: 'Standings', icon: 'standings', exact: true, also: ['/sports/places'] },
  { href: '/sports/schedule', label: 'Schedule', icon: 'schedule' },
  { href: '/sports/bracket', label: 'Bracket', icon: 'bracket' },
];

const MANAGE: SectionNavItem = { href: '/sports/manage', label: 'Manage', icon: 'manage' };

export function SportsNav({ canManage }: { canManage: boolean }) {
  return <SectionNav label="Sports" items={canManage ? [...ITEMS, MANAGE] : ITEMS} />;
}
