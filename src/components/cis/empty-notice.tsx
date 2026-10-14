/**
 * The empty or waiting state of a Sports screen: a heading, a sentence of plain
 * explanation, and optionally a note and a way forward under a heavy rule.
 * No illustration, no emoji (§3): the words do the job.
 */

import type { ReactNode } from 'react';

import { SheetHeading, SheetRule } from '@/components/cis/sheet';

export function EmptyNotice({
  title,
  children,
  note,
  action,
}: {
  title: string;
  children: ReactNode;
  /** A smaller line under the rule. */
  note?: ReactNode;
  /** A link-button under the note. */
  action?: ReactNode;
}) {
  return (
    <div className="pb-1">
      <SheetHeading className="pb-1.5">{title}</SheetHeading>
      <p className="text-cis-base font-semibold leading-[1.5] text-cis-ink-muted">{children}</p>
      {note || action ? <SheetRule className="mb-3 mt-[18px]" /> : null}
      {note ? <p className="text-cis-sm font-bold text-cis-ink-muted">{note}</p> : null}
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}
