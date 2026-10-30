'use client';

/**
 * `SectionNav`: the fixed bottom bar (`DESIGN_SYSTEM.md` §7). `AppNav` is the one
 * place that renders it: the same role-based items on every screen. Sections
 * list their own pages with `SectionTabs` at the top instead, which share
 * `SectionNavItem` and `isNavItemOn` with this bar.
 *
 * A floating dock, not a full-width slab: it sits 14px in from the edges like the
 * sheets, with the shell radius (a capsule at this height) and equal padding
 * above and below the icons; the chips inside use the sheet radius so the
 * corners stay concentric. Eleven-pixel labels, 56 x 52px minimum targets,
 * opaque board ground: a translucent bar fails in direct sun (§3). Every item
 * is cream; the current one sits on a darker orange chip and carries
 * `aria-current`. Cream on the bright `--cis-orange` is only 3.0:1, so the chip
 * uses the 4.5:1 orange that links use.
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
  /** Shown in the bottom bar; `SectionTabs` are text only. */
  icon?: IconName;
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
 * (`href + '/'`), so `/register` is not lit on `/registrations`. `/` is a prefix
 * of everything, so Today is lit on the home page alone.
 */
export function isNavItemOn(item: SectionNavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-3.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] print:hidden"
    >
      <div className="pointer-events-auto mx-auto max-w-[560px] overflow-x-auto rounded-cis-shell bg-cis-board text-cis-ink-on-dark shadow-cis-sheet">
        <ul className="flex w-full min-w-max items-stretch gap-1 p-2">
          {items.map((item) => {
            const on = isNavItemOn(item, pathname);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.to ?? item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-1 rounded-cis-sheet text-[11px] font-bold',
                    on && 'bg-cis-orange-text font-extrabold text-cis-paper-light',
                  )}
                >
                  {item.icon ? <Icon name={item.icon} /> : null}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
