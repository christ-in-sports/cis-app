'use client';

/**
 * `SportsNav`, from the Sports components (`DESIGN_SYSTEM.md` §7).
 *
 * Entering Sports swaps the bottom nav to Home / Standings / Schedule / Bracket,
 * with Manage added for Admin and Program Team. "Home" goes back to the app.
 * Eleven-pixel labels, 56 x 48px minimum targets, opaque ground: a translucent
 * bar fails in direct sun (§3).
 *
 * The global set proposed alongside these designs (Today / Sports / Calendar /
 * Team) is not agreed and is not built; this is the in-section nav only.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon, type IconName } from '@/components/cis/icon';
import { cn } from '@/lib/utils';

interface Item {
  href: string;
  label: string;
  icon: IconName;
  /**
   * Lit only on this exact path (and `also`). Standings lives at `/sports`, which
   * is a prefix of every other Sports page, so a prefix match would light it
   * alongside the item for the page you are really on.
   */
  exact?: boolean;
  /** Other paths that keep this item lit, e.g. final places under Standings. */
  also?: string[];
}

const ITEMS: Item[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/sports', label: 'Standings', icon: 'standings', exact: true, also: ['/sports/places'] },
  { href: '/sports/schedule', label: 'Schedule', icon: 'schedule' },
  { href: '/sports/bracket', label: 'Bracket', icon: 'bracket' },
];

const MANAGE: Item = { href: '/sports/manage', label: 'Manage', icon: 'manage' };

/**
 * The division and sport the viewer is on, carried onto every in-section link so
 * they stay on that sport while moving between Standings, Schedule and Bracket.
 * (`KeepSelection` puts what a page resolved into the URL for this to read.)
 */
function carry(href: string, params: URLSearchParams): string {
  if (href === '/') return href;
  const keep = new URLSearchParams();
  for (const key of ['division', 'block']) {
    const value = params.get(key);
    if (value) keep.set(key, value);
  }
  const text = keep.toString();
  return text ? `${href}?${text}` : href;
}

export function SportsNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const items = canManage ? [...ITEMS, MANAGE] : ITEMS;

  const isOn = (item: Item) =>
    item.href === '/'
      ? false // Home leaves Sports, so it is never the current item here.
      : pathname === item.href ||
        (!item.exact && pathname.startsWith(`${item.href}/`)) ||
        (item.also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <nav
      aria-label="Sports"
      className="fixed inset-x-0 bottom-0 z-10 bg-cis-board pb-[env(safe-area-inset-bottom)] text-cis-ink-on-dark"
    >
      <ul className="mx-auto flex w-full max-w-[560px] items-center justify-between px-[14px] pb-6 pt-1.5">
        {items.map((item) => {
          const on = isOn(item);
          return (
            <li key={item.href}>
              <Link
                href={carry(item.href, params)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex min-h-[48px] min-w-[56px] flex-col items-center justify-center gap-[5px] text-[11px] font-bold',
                  on && 'font-extrabold text-cis-apricot',
                )}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
