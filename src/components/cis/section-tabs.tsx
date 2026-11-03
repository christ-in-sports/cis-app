'use client';

/**
 * `SectionTabs`: a section's own pages, as a row of tabs at the top of the board
 * (`DESIGN_SYSTEM.md` §7). The bottom bar (`AppNav`) moves between sections and
 * stays the same everywhere; these move between the pages of one section, so
 * Sports, Attendance and Registration no longer swap the bottom bar out.
 *
 * Text only, 44px tall, chip radius. The current tab is a slate fill with light
 * text, like an active chip; the others are pale slate with slate text. The row
 * scrolls sideways rather than wrapping when a section has many pages. A single
 * tab is no choice at all, so a section with one page for this viewer shows none.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isNavItemOn, type SectionNavItem } from '@/components/cis/section-nav';
import { cn } from '@/lib/utils';

export function SectionTabs({ label, items }: { label: string; items: readonly SectionNavItem[] }) {
  const pathname = usePathname();
  if (items.length < 2) return null;

  return (
    <nav aria-label={label} className="overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden print:hidden">
      <ul className="flex min-w-max gap-2">
        {items.map((item) => {
          const on = isNavItemOn(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.to ?? item.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex min-h-cis-tap-min items-center rounded-cis-chip px-3.5 text-cis-sm font-extrabold',
                  on ? 'bg-cis-action text-cis-ink-on-action' : 'bg-cis-chrome-tab text-cis-action',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
