/**
 * Pieces every Sports page assembles the same way.
 */

import type { ReactNode } from 'react';

import { Sheet } from '@/components/cis/sheet';

/** The sheet under `DivisionTabs`: joined to the active tab, 14px in from the board. */
export function SportsSheet({ children }: { children: ReactNode }) {
  return (
    <Sheet joined className="mx-3.5 mb-3.5 px-[18px] pb-[22px] pt-5">
      {children}
    </Sheet>
  );
}

/** A sheet that is not under tabs (final places, a form). */
export function PlainSheet({ children }: { children: ReactNode }) {
  return <Sheet className="mx-3.5 mb-3.5 mt-1.5 px-[18px] pb-[22px] pt-5">{children}</Sheet>;
}
