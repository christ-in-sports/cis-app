/**
 * Small parts of the Manage screens: `ResultStrip` (what the last action did),
 * `ActionNote` (why an action is locked, with a lock; or a note under an open
 * one), `Fixtures` (the three counts under the tracker) and `LockedField` (a value
 * that cannot be edited because the block already has games).
 */

import type { ReactNode } from 'react';

import { Icon } from '@/components/cis/icon';
import { cn } from '@/lib/utils';

export function ResultStrip({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-cis-chip bg-cis-paper px-3.5 py-3 text-cis-base font-bold leading-[1.4]">
      <Icon name="check" size={20} strokeWidth={3.2} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ActionNote({ locked, children }: { locked?: boolean; children: ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-1.5 text-cis-sm font-bold leading-[1.4] text-cis-ink-muted">
      <Icon name={locked ? 'lock' : 'check'} size={16} strokeWidth={3} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function Fixtures({ items }: { items: readonly { n: number; label: string }[] }) {
  return (
    <dl className="m-0 grid grid-cols-3 gap-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <dd className="m-0 font-cis-display text-cis-display-md leading-none">{item.n}</dd>
          <dt className="mt-1 text-cis-xs font-bold text-cis-ink-muted">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-cis-base font-bold leading-[1.3]">{label}</div>
      <div className={cn('flex min-h-12 items-center justify-between gap-2 rounded-cis-chip bg-cis-paper px-3.5 text-cis-md font-bold')}>
        {value}
        <Icon name="lock" size={16} strokeWidth={3} className="shrink-0 text-cis-ink-muted" />
      </div>
    </div>
  );
}
