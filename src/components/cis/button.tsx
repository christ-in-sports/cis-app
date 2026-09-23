/**
 * `PrimaryButton` and `SecondaryButton` from the design system's component
 * inventory (`DESIGN_SYSTEM.md` §7).
 *
 * Buttons are the *only* place the full pill radius is used (§6) -- sheets,
 * chips and tick boxes each have their own fixed radius, so reaching for
 * `rounded-full` anywhere else is the anti-pattern this component exists to
 * prevent.
 *
 * Text on an orange fill is ink, never white: white is 2.6:1 and fails at every
 * size, ink is 6.6:1 (§4).
 *
 * The press behaviour is from §6: a filled button translates 3px down and its
 * 4px offset shadow shrinks to 1px, so the stamp looks pressed into the page.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Stretch to fill the row, for a sheet-width action. */
  block?: boolean;
  children: ReactNode;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-cis-pill font-cis-body ' +
  'text-cis-lg font-extrabold leading-none transition-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function PrimaryButton({ block, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        base,
        'min-h-cis-tap-primary px-6 bg-cis-orange text-cis-ink-dark shadow-cis-press',
        'hover:bg-cis-orange-hover',
        // Pressed: down 3px, shadow shrinks 4px -> 1px.
        'active:translate-y-[3px] active:shadow-[0_1px_0_var(--cis-orange-shadow)]',
        // A disabled button must not look pressable.
        'disabled:shadow-none disabled:active:translate-y-0',
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ block, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        base,
        'min-h-cis-tap-primary px-6 border-[3px] border-cis-ink bg-cis-paper-light text-cis-ink',
        // §3: hover changes background only -- the one non-opaque value in the
        // system is this wash.
        'hover:bg-[rgba(36,31,28,.07)]',
        'active:translate-y-[1px]',
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
