/**
 * The frame the Registration screens share: the board behind them, the nav under
 * them, and a column that holds sheets the way the Sports screens do -- 14px in
 * from the board's edge and 14px apart.
 *
 * `RegistrationFrame` is rendered once, by the route group's layout
 * (`app/(registration)/layout.tsx`), not by each page. That is what keeps the
 * board and the nav on screen while a page is still loading: a layout stays put
 * and only its page swaps, whereas a frame built inside each page vanishes with
 * the page and leaves the root loading screen's cream background in its place.
 * Sports does the same with `app/sports/layout.tsx`.
 *
 * Anything placed directly on the board (not inside a sheet) is on a dark brown
 * ground: dark ink and orange text are unreadable there. Put controls inside a
 * sheet, and use the pale `BoardHeader` for the heading.
 */

import type { ReactNode } from 'react';

import { BoardShell } from '@/components/cis/board-shell';
import { cn } from '@/lib/utils';

export function RegistrationFrame({
  nav,
  className,
  children,
}: {
  /** The bottom nav. A slot, so the layout can stream it in once roles are known. */
  nav: ReactNode;
  /** Applied to the content column -- pass a width when the default is wrong. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <BoardShell className={className}>
      {children}
      {nav}
    </BoardShell>
  );
}

/**
 * The column the sheets sit in under a `BoardHeader`. The 6px on top is the same
 * gap Sports' `PlainSheet` leaves (`mt-1.5`), so a sheet never touches the title.
 */
export function RegistrationColumn({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('flex flex-col gap-3.5 px-3.5 pb-3.5 pt-1.5', className)}>{children}</div>;
}
