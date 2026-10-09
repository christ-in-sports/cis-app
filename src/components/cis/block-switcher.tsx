/**
 * `BlockSwitcher`, from the Sports components (`DESIGN_SYSTEM.md` §7).
 *
 * `ChoiceGroup`-style chips that switch the sport block under a `DivisionTabs`:
 * 12px radius, ink-filled when selected, the whole chip the tap target (44px).
 * Used for the sport block, and for the schedule's "All blocks" / "Your team only"
 * filters, which are the same control with a tick shown when a filter is on.
 *
 * Links, so the choice lives in the URL.
 */

import Link from 'next/link';
import { Icon } from '@/components/cis/icon';
import { cn } from '@/lib/utils';

export interface BlockSwitcherItem {
  key: string;
  label: string;
  href: string;
  selected: boolean;
  /** Show a tick, for a filter that is switched on. */
  tick?: boolean;
}

export function BlockSwitcher({
  items,
  label,
  className,
}: {
  items: readonly BlockSwitcherItem[];
  /** What the group chooses between, for assistive technology. */
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.selected ? 'true' : undefined}
          className={cn(
            'inline-flex min-h-cis-tap-min items-center gap-1.5 rounded-cis-chip border-2 border-cis-ink px-4 text-cis-base font-extrabold',
            item.selected ? 'bg-cis-ink text-cis-paper-light' : 'text-cis-ink',
          )}
        >
          {item.tick && item.selected ? <Icon name="check" size={14} strokeWidth={3} /> : null}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
