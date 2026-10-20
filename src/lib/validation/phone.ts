import { z } from 'zod';

/**
 * Normalises a phone number for display consistency.
 *
 * Anything that is not recognisably a 10-digit US number is passed through as
 * typed -- these are contact details for reaching someone in an emergency, so
 * an unusual format must never be discarded. A blank is null. The CSV importer
 * calls this on cells it has already cleaned of "N/A"-style placeholders.
 */
export function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;

  const local = usDigits(text);
  if (local === null) return text;

  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** The 10 digits of a US number, dropping a leading 1, or null if it is not one. */
function usDigits(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return local.length === 10 ? local : null;
}

/**
 * True for a dialable US number: 10 digits (optional leading 1), with an area
 * code and exchange that do not start with 0 or 1.
 */
export function isUsPhone(value: string): boolean {
  const local = usDigits(value.trim());
  return local !== null && /^[2-9]\d{2}[2-9]\d{6}$/.test(local);
}

/**
 * A required US phone number, stored in the `(510) 555-1234` format.
 * Unlike `normalizePhone`, anything that is not a US number is rejected.
 */
export const usPhone = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isUsPhone, `${label} must be a valid US phone number`)
    .transform((v) => normalizePhone(v) as string);
