/**
 * `DivisionTabs`, from the design system's component inventory (`DESIGN_SYSTEM.md` §7).
 *
 * Juniors / Ambassadors. The active tab is joined to the sheet below it, like a
 * file tab: its top corners are the one 18px radius in the system (§6) and the
 * sheet under it squares its own (`<Sheet joined>`).
 *
 * Links, not buttons: the division lives in the URL (`?division=`) so a screen
 * can be bookmarked or shared, and the server renders the right data.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';

export type DivisionKey = 'juniors' | 'ambassadors';

const TABS: { key: DivisionKey; name: string; ages: string }[] = [
  { key: 'juniors', name: 'Juniors', ages: 'Ages 10–13' },
  { key: 'ambassadors', name: 'Ambassadors', ages: 'Ages 14–18' },
];

export function DivisionTabs({
  value,
  hrefFor,
}: {
  value: DivisionKey;
  hrefFor: (division: DivisionKey) => string;
}) {
  return (
    <nav aria-label="Division" className="flex gap-2 px-3.5 pt-2.5">
      {TABS.map((tab) => {
        const on = tab.key === value;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 rounded-t-cis-tab px-2 pb-3 pt-[11px] text-center text-[14px] font-extrabold',
              on ? 'bg-cis-paper-light text-cis-ink' : 'bg-cis-board-tab text-cis-paper-light',
            )}
          >
            {tab.name}
            <small className={cn('text-cis-xs font-bold', on ? 'text-cis-ink-muted' : 'text-cis-ink-on-dark')}>
              {tab.ages}
            </small>
          </Link>
        );
      })}
    </nav>
  );
}
