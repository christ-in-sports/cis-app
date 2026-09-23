/**
 * The page frame both CIS screens sit in: warm page ground, a centred column,
 * and breathing room top and bottom.
 *
 * Exists partly because §3 turns any repeated 8+ utility string into a
 * component, and partly to keep the safe-area handling in one place.
 *
 * On safe areas: the repo has `.safe-top` / `.safe-bottom` utilities in
 * globals.css that set `padding-top` / `padding-bottom` to the device inset.
 * Because those are plain CSS rules setting the same property, they *replace*
 * any Tailwind padding on the same element rather than adding to it -- so
 * `pb-32 safe-bottom` renders with no bottom padding at all on any device
 * without a home indicator, which is every desktop browser. This component
 * folds the inset into the padding instead, so the two compose:
 *
 *     padding-bottom: calc(env(safe-area-inset-bottom) + 6rem)
 *
 * The same conflict affects roughly a dozen other screens (attendance,
 * tournament, dashboard) that still pair `safe-*` with a Tailwind padding
 * class. Fixing those is its own change -- see the PR description.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageShell({
  className,
  children,
}: {
  /** Applied to the centred column -- pass a width when the default is wrong. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'min-h-screen bg-cis-page px-4 font-cis-body text-cis-ink',
        'pt-[calc(env(safe-area-inset-top)+2.5rem)]',
        'pb-[calc(env(safe-area-inset-bottom)+6rem)]',
      )}
    >
      <div className={cn('mx-auto flex w-full max-w-[560px] flex-col gap-cis-4', className)}>
        {children}
      </div>
    </div>
  );
}
