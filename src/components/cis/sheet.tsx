/**
 * `Sheet` and its two parts, from the design system's component inventory
 * (`DESIGN_SYSTEM.md` §7).
 *
 * The cream paper card that every CIS screen is built out of. Sheets never take
 * a border -- the design uses rule weights where other systems would use card
 * borders (§6), which is why `SheetRule` exists as its own part rather than
 * being a `border-t` on whatever follows it.
 *
 * Deliberately minimal: only the props the screens built so far use. The rest of
 * the §7 inventory stays unbuilt until a screen needs it.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Sheet({
  joined,
  className,
  children,
}: {
  /** `light` is the primary sheet, `paper` the secondary one (§7); same fill on the cream page. */
  tone?: 'light' | 'paper';
  /**
   * Squares the top corners so the sheet reads as one piece with the active
   * `DivisionTabs` tab above it (§6).
   */
  joined?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        // Ink text, set here rather than inherited: a sheet can sit on the dark
        // board, whose own text is pale.
        'rounded-cis-sheet text-cis-ink shadow-cis-sheet',
        // Both tones share one fill: --cis-paper is too close to the cream page
        // (about 1.1:1) to stand out from it, so `paper` kept only the name.
        'bg-cis-paper-light',
        joined && 'rounded-t-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Caprasimo, sentence case. The display face is reserved for headings and
 * scores and is never used for body copy (§5).
 */
export function SheetHeading({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      className={cn(
        'font-cis-display text-cis-lg font-normal leading-[1.1] text-cis-ink',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** The 5px ink region divide inside a sheet (§6's rule-weight table). */
export function SheetRule({ className }: { className?: string }) {
  return <div className={cn('h-[5px] rounded-[3px] bg-cis-ink-dark', className)} />;
}
