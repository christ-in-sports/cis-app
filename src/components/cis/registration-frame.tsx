/**
 * `RegistrationColumn`: the column the Registration screens hold their sheets in,
 * 14px in from the board's edge and 14px apart, the way the Sports screens do.
 * The board and the bottom bar come from the app shell (`app/(app)/layout.tsx`).
 *
 * The page behind the sheets is cream. Controls still go inside a sheet, and the
 * `BoardHeader` carries the heading.
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

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
