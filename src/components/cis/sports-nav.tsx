'use client';

/**
 * `SportsNav`, from the Sports components (`DESIGN_SYSTEM.md` §7).
 *
 * Entering Sports swaps the bottom nav to Home / Standings / Schedule / Bracket,
 * with Teams and Manage added for Admin and Program Team. "Home" goes back to the app.
 * The bar itself is `SectionNav`, shared with the Registration section; this
 * only says which items Sports has.
 *
 * The global set proposed alongside these designs (Today / Sports / Calendar /
 * Team) is not agreed and is not built; this is the in-section nav only.
 */

import { useSearchParams } from 'next/navigation';

import { SectionNav, type SectionNavItem } from '@/components/cis/section-nav';

const ITEMS: SectionNavItem[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/sports', label: 'Standings', icon: 'standings', exact: true, also: ['/sports/places'] },
  { href: '/sports/schedule', label: 'Schedule', icon: 'schedule' },
  { href: '/sports/bracket', label: 'Bracket', icon: 'bracket' },
];

const MANAGE: SectionNavItem = { href: '/sports/manage', label: 'Manage', icon: 'manage' };

/**
 * The division and sport the viewer is on, carried onto every in-section link so
 * they stay on that sport while moving between Standings, Schedule and Bracket.
 * (`KeepSelection` puts what a page resolved into the URL for this to read.)
 */
function carry(href: string, params: URLSearchParams): string {
  if (href === '/' || href === '/teams') return href;
  const keep = new URLSearchParams();
  for (const key of ['division', 'block']) {
    const value = params.get(key);
    if (value) keep.set(key, value);
  }
  const text = keep.toString();
  return text ? `${href}?${text}` : href;
}

export function SportsNav({ canManage }: { canManage: boolean }) {
  const params = useSearchParams();
  const items = (canManage ? [...ITEMS, { href: '/teams', label: 'Teams', icon: 'roster' as const }, MANAGE] : ITEMS).map((item) => ({
    ...item,
    // The link carries the viewer's division and sport; `href` stays the plain
    // path so `SectionNav` still matches the current page against it.
    to: carry(item.href, params),
  }));

  return <SectionNav label="Sports" items={items} />;
}
