/**
 * How families pay for registration, and the shape of a payment an Admin
 * records (ENG-9).
 *
 * There is no payment integration -- Stripe is v1.0 -- so the parent form only
 * *tells* families how to pay, and an Admin records what arrived on the roster.
 * Like the waiver link (`waiver.ts`), this is program information kept in code:
 * it changes once a season at most, and a constant is one obvious place to
 * change it.
 *
 * The parent form must never show whether a kid has paid. Nothing here reads a
 * payment; it only describes how to make one.
 */

import { z } from 'zod';

/**
 * The registration fee, in cents.
 *
 * PLACEHOLDER: pricing is not confirmed yet. While this is `null` the form says
 * the fee is to be announced and the roster shows totals without an "of $X".
 * Set it to a number of cents (e.g. `8500` for $85) once the fee is known.
 */
export const REGISTRATION_FEE_CENTS: number | null = null;

/** Matches the `payments_method_values` CHECK. */
export const PAYMENT_METHOD_IDS = ['cash', 'venmo', 'paypal'] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_IDS)[number];

export interface PaymentMethodInfo {
  id: PaymentMethod;
  label: string;
  /** Who or where to pay, as shown to a parent. */
  detail: string;
  /** Set where the detail is something a parent can open. */
  url?: string;
}

export const PAYMENT_METHODS: readonly PaymentMethodInfo[] = [
  { id: 'cash', label: 'Cash', detail: 'Give it to Maria Ehab or Joseph Tadrous' },
  { id: 'venmo', label: 'Venmo', detail: '@CIS-stantonios' },
  {
    id: 'paypal',
    label: 'PayPal',
    detail: 'paypal.me/ChristinSports',
    url: 'https://paypal.me/ChristinSports/',
  },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  venmo: 'Venmo',
  paypal: 'PayPal',
};

/** `8500` -> `"$85"`, `4250` -> `"$42.50"`. Whole dollars drop the cents. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Mirrors the `payments_amount_range` CHECK: more than $0, at most $1,000. */
export const MAX_PAYMENT_CENTS = 100_000;

/**
 * A payment as an Admin types it: dollars, as text, straight from an input.
 *
 * Parsed from the string rather than through `Number()` so "1e3", "0x10" or
 * "85.999" are rejected instead of quietly becoming something else, and turned
 * into integer cents here so no float ever reaches the database.
 */
export const recordPaymentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount in dollars, like 85 or 42.50')
    .transform((v) => Math.round(parseFloat(v) * 100))
    .refine((cents) => cents > 0, 'The amount must be more than $0')
    .refine(
      (cents) => cents <= MAX_PAYMENT_CENTS,
      `The amount must be at most ${formatCents(MAX_PAYMENT_CENTS)}`,
    ),
  method: z.enum(PAYMENT_METHOD_IDS, 'Choose how it was paid'),
});

export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
