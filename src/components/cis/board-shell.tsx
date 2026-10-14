/**
 * The hardboard the Sports screens sit on, and the header that sits on it.
 *
 * `PhoneShell` in the design system is the 390px board frame with a status bar;
 * on a real phone the device is the frame and the status bar is the device's own,
 * so what is left is the board colour behind everything and the heading on it.
 * Content is held to a phone-width column so it does not stretch on a desktop.
 *
 * The bottom padding leaves room for the fixed `SportsNav` so the last sheet is
 * never hidden behind it.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function BoardShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'cis-focus-scope min-h-screen bg-cis-board font-cis-body text-cis-ink-on-dark',
        'pt-[calc(env(safe-area-inset-top)+0.75rem)]',
        'pb-[calc(env(safe-area-inset-bottom)+6rem)]',
      )}
    >
      <div className={cn('mx-auto w-full max-w-[560px]', className)}>{children}</div>
    </div>
  );
}

/**
 * Kicker, title and an optional note at the right ("Updated 2:41 PM").
 * The title is the display face; there is no all-caps eyebrow (§3), the kicker
 * is sentence case.
 */
export function BoardHeader({
  kicker,
  title,
  meta,
  action,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** A control at the right instead of `meta`, such as a back link. */
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-2.5 px-6 pb-2 pt-3">
      <div>
        {kicker ? <div className="text-cis-sm font-bold text-cis-apricot">{kicker}</div> : null}
        <h1 className="mt-0.5 font-cis-display text-cis-display-md font-normal leading-[1.1]">{title}</h1>
      </div>
      {action ?? (meta ? <div className="text-right text-cis-xs font-bold leading-[1.5] text-cis-ink-on-dark">{meta}</div> : null)}
    </header>
  );
}
