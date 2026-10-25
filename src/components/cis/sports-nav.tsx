'use client';

/**
 * `SportsNav`, from the Sports components (`DESIGN_SYSTEM.md` §7).
 *
 * The Sports section's tabs: Standings / Schedule / Bracket, with Teams and Manage added
 * for Admin and Program Team. They sit at the top of the board (`SectionTabs`);
 * the app's bottom bar (`AppNav`) stays as it is.
 */

import { useSearchParams } from 'next/navigation';

import type { SectionNavItem } from '@/components/cis/section-nav';
import { SectionTabs } from '@/components/cis/section-tabs';

const ITEMS: SectionNavItem[] = [
  { href: '/sports', label: 'Standings', exact: true, also: ['/sports/places'] },
  { href: '/sports/schedule', label: 'Schedule' },
  { href: '/sports/bracket', label: 'Bracket' },
];

const MANAGE: SectionNavItem = { href: '/sports/manage', label: 'Manage' };

/**
 * The division and sport the viewer is on, carried onto every in-section link so
 * they stay on that sport while moving between Standings, Schedule and Bracket.
 * (`KeepSelection` puts what a page resolved into the URL for this to read.)
 */
function carry(href: string, params: URLSearchParams): string {
  if (href === '/teams') return href;
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
  const items = (canManage ? [...ITEMS, { href: '/teams', label: 'Teams' }, MANAGE] : ITEMS).map((item) => ({
    ...item,
    // The link carries the viewer's division and sport; `href` stays the plain
    // path so `SectionTabs` still matches the current page against it.
    to: carry(item.href, params),
  }));

  return <SectionTabs label="Sports" items={items} />;
}
