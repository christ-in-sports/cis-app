/**
 * `MenuSheet` and `MenuRow`: a sheet of ruled rows that each link somewhere,
 * used by Today and More (`DESIGN_SYSTEM.md` §7). Unlike `LinkRow`, which stands
 * alone under a heavy rule, these rows share one sheet: a heading, the 5px ink
 * rule, then hairlines between rows.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/cis/icon';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';

export function MenuSheet({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Sheet className="px-cis-5 pb-cis-2 pt-cis-4">
      <SheetHeading>{heading}</SheetHeading>
      <SheetRule className="mt-2.5" />
      <ul>{children}</ul>
    </Sheet>
  );
}

export function MenuRow({ href, title, note }: { href: string; title: string; note?: string }) {
  return (
    <li className="border-b border-cis-rule last:border-b-0">
      <Link href={href} className="flex min-h-[56px] items-center justify-between gap-cis-3 py-cis-2">
        <span>
          <span className="block text-cis-md font-extrabold">{title}</span>
          {note ? <span className="block text-cis-sm font-bold text-cis-ink-muted">{note}</span> : null}
        </span>
        <span className="shrink-0 text-cis-orange-text">
          <Icon name="chevron-right" />
        </span>
      </Link>
    </li>
  );
}
