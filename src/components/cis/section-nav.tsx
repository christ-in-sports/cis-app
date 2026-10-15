'use client';

/**
 * `SectionNav`: the fixed bottom nav a section swaps in when you enter it
 * (`DESIGN_SYSTEM.md` §7). Sports and Registration each pass their own items;
 * the bar itself is the same, so it lives here once rather than being copied.
 *
 * Eleven-pixel labels, 56 x 48px minimum targets, opaque board ground: a
 * translucent bar fails in direct sun (§3). The current item is apricot and
 * carries `aria-current`.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/cis/icon';
import { cn } from '@/lib/utils';

export interface SectionNavItem {
  /** The item's path. Used to decide whether it is the current page. */
  href: string;
  /**
   * Where the link actually goes, when that differs from `href` -- Sports carries
   * the chosen division and sport in the query string. Defaults to `href`.
   */
  to?: string;
  label: string;
  icon: IconName;
  /**
   * Lit only on this exact path (and `also`). Use it where the item's path is a
   * prefix of its siblings' -- Standings lives at `/sports`, which is a prefix of
   * every other Sports page, so a prefix match would light it alongside the item
   * for the page you are really on.
   */
  exact?: boolean;
  /** Other paths that keep this item lit, e.g. final places under Standings. */
  also?: string[];
}

/**
 * Whether `item` is the current page. A prefix only counts at a path boundary
 * (`href + '/'`), so `/register` is not lit on `/registrations`. Home leaves the
 * section, so it is never current inside it.
 */
export function isNavItemOn(item: SectionNavItem, pathname: string): boolean {
  if (item.href === '/') return false;
  return (
    pathname === item.href ||
    (!item.exact && pathname.startsWith(`${item.href}/`)) ||
    (item.also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

export function SectionNav({ label, items }: { label: string; items: readonly SectionNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-10 bg-cis-board pb-[env(safe-area-inset-bottom)] text-cis-ink-on-dark"
    >
      <ul className="mx-auto flex w-full max-w-[560px] items-center justify-between px-[14px] pb-6 pt-1.5">
        {items.map((item) => {
          const on = isNavItemOn(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.to ?? item.href}
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
