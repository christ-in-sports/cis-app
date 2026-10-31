/**
 * `MenuSheet` and `MenuRow`: a sheet of ruled rows that each link somewhere,
 * used by Today and More (`DESIGN_SYSTEM.md` §7). Unlike `LinkRow`, which stands
 * alone under a heavy rule, these rows share one sheet: a heading, the 5px ink
 * rule, then hairlines between rows.
 *
 * A row may lead with a small icon tile coloured by its domain, so a screen of
 * menus still says what each row is about at a glance: orange for the game,
 * sage for faith, pale slate for people and admin (`DESIGN_SYSTEM.md` §4). The
 * tile is a label, not a button: the whole row is the link.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/cis/icon';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import { cn } from '@/lib/utils';

export function MenuSheet({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Sheet className="px-cis-5 pb-cis-2 pt-cis-4">
      <SheetHeading>{heading}</SheetHeading>
      <SheetRule className="mt-2.5" />
      <ul>{children}</ul>
    </Sheet>
  );
}

/** What a row is about, which picks its tile colour. */
export type MenuDomain = 'sport' | 'faith' | 'people';

const TILE: Record<MenuDomain, string> = {
  sport: 'bg-cis-sport-tint text-cis-sport-text',
  faith: 'bg-cis-sage-tint text-cis-sage-text',
  people: 'bg-cis-chrome-tab text-cis-action',
};

export function MenuRow({
  href,
  title,
  note,
  icon,
  domain = 'people',
}: {
  href: string;
  title: string;
  note?: string;
  icon?: IconName;
  domain?: MenuDomain;
}) {
  return (
    <li className="border-b border-cis-rule last:border-b-0">
      <Link href={href} className="flex min-h-[56px] items-center gap-cis-3 py-cis-2">
        {icon ? (
          <span
            data-domain={domain}
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-cis-chip', TILE[domain])}
          >
            <Icon name={icon} size={20} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-cis-md font-extrabold">{title}</span>
          {note ? <span className="block text-cis-sm font-bold text-cis-ink-muted">{note}</span> : null}
        </span>
        <span className="shrink-0 text-cis-action">
          <Icon name="chevron-right" />
        </span>
      </Link>
    </li>
  );
}
