/**
 * `Chip`, from the design system's component inventory (`DESIGN_SYSTEM.md` §7).
 *
 * The 12px label. State is carried by the label and the chip's own shape, never
 * by a bare colour dot (§3), so each variant reads without its colour:
 *
 *  - `sport`    ember fill: a played game ("Final"), or a finished block.
 *  - `active`   orange fill: the next game to start.
 *  - `outline`  2px ink outline: teams known, not started.
 *  - `dashed`   2px dashed muted outline: waiting on an earlier game.
 *  - `tint`     apricot fill: a neutral label ("League · round 3 of 7", "Your team").
 *
 * `faith` and `stamp` from the inventory are not built yet; nothing needs them.
 * Ember appears on a chip only to mark a result, and never on anything pressable (§4).
 */

import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const chip = cva('inline-block whitespace-nowrap rounded-cis-chip font-cis-body font-bold', {
  variants: {
    variant: {
      sport: 'bg-cis-ember text-cis-ink-on-ember',
      active: 'bg-cis-orange text-cis-ink-dark',
      outline: 'border-2 border-cis-ink text-cis-ink',
      dashed: 'border-2 border-dashed border-cis-ink-muted text-cis-ink-muted',
      tint: 'bg-cis-apricot-tint text-cis-orange-deep',
    },
    size: {
      m: 'text-cis-sm',
      s: 'text-cis-xs',
    },
  },
  compoundVariants: [
    // Outlined chips lose 2px of padding to the border so every chip is the
    // same size as a filled one.
    { variant: ['sport', 'active', 'tint'], size: 'm', className: 'px-[11px] py-[6px]' },
    { variant: ['sport', 'active', 'tint'], size: 's', className: 'px-2 py-0.5' },
    { variant: ['outline', 'dashed'], size: 'm', className: 'px-[9px] py-1' },
    { variant: ['outline', 'dashed'], size: 's', className: 'px-1.5 py-0' },
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
