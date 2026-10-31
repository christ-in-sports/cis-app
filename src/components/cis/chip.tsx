/**
 * `Chip`, from the design system's component inventory (`DESIGN_SYSTEM.md` §7).
 *
 * The 12px label. State is carried by the label and the chip's own shape, never
 * by a bare colour dot (§3), so each variant reads without its colour:
 *
 *  - `sport`    pale orange, orange text: "Final" on a game, a block or final places.
 *  - `result`   the same as `sport`; kept for game rows.
 *  - `next`     2px orange outline, orange text: the next game to start.
 *  - `active`   slate fill: a current selection that is not the game.
 *  - `outline`  2px ink outline: teams known, not started.
 *  - `dashed`   2px dashed muted outline: waiting on an earlier game.
 *  - `tint`     pale slate: a neutral label ("League · round 3 of 7", "Your team").
 *
 * `faith` and `stamp` from the inventory are not built yet; nothing needs them.
 * Orange appears on a chip only to mark the game, and never on anything pressable (§4).
 */

import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const chip = cva('inline-block whitespace-nowrap rounded-cis-chip font-cis-body font-bold', {
  variants: {
    variant: {
      sport: 'bg-cis-sport-tint text-cis-sport-deep',
      result: 'bg-cis-sport-tint text-cis-sport-deep',
      next: 'border-2 border-cis-sport text-cis-sport-deep',
      active: 'bg-cis-action text-cis-ink-on-action',
      outline: 'border-2 border-cis-ink text-cis-ink',
      dashed: 'border-2 border-dashed border-cis-ink-muted text-cis-ink-muted',
      tint: 'bg-cis-chrome-tab text-cis-action',
    },
    size: {
      m: 'text-cis-sm',
      s: 'text-cis-xs',
    },
  },
  compoundVariants: [
    // Outlined chips lose 2px of padding to the border so every chip is the
    // same size as a filled one.
    { variant: ['sport', 'result', 'active', 'tint'], size: 'm', className: 'px-[11px] py-[6px]' },
    { variant: ['sport', 'result', 'active', 'tint'], size: 's', className: 'px-2 py-0.5' },
    { variant: ['outline', 'dashed', 'next'], size: 'm', className: 'px-[9px] py-1' },
    { variant: ['outline', 'dashed', 'next'], size: 's', className: 'px-1.5 py-0' },
  ],
  defaultVariants: { variant: 'tint', size: 'm' },
});

export function Chip({
  variant,
  size,
  className,
  children,
}: VariantProps<typeof chip> & { className?: string; children: ReactNode }) {
  return <span className={cn(chip({ variant, size }), className)}>{children}</span>;
}
