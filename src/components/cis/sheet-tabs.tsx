/**
 * `SheetTabs`: file tabs joined to the sheet below them (`DESIGN_SYSTEM.md` §6).
 * The active tab's top corners are the one 18px radius in the system, and the
 * sheet under it squares its own (`<Sheet joined>`).
 *
 * Links, not buttons: the choice lives in the URL so a screen can be bookmarked
 * or shared, and the server renders the right data. `DivisionTabs` is the
 * Juniors / Ambassadors use of this; the Roles screen uses it for Servants /
 * Parents.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface SheetTab<K extends string> {
  key: K;
  name: string;
  /** The small second line under the name. */
  note: string;
  href: string;
}

export function SheetTabs<K extends string>({
  label,
  value,
  tabs,
  className,
}: {
  label: string;
  value: K;
  tabs: readonly SheetTab<K>[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('flex gap-2 px-3.5 pt-2.5', className)}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 rounded-t-cis-tab px-2 pb-3 pt-[11px] text-center text-[14px] font-extrabold',
              on ? 'bg-cis-paper-light text-cis-ink' : 'bg-cis-chrome-tab text-cis-action',
            )}
          >
            {tab.name}
            <small className="text-cis-xs font-bold text-cis-ink-muted">{tab.note}</small>
          </Link>
        );
      })}
    </nav>
  );
}
