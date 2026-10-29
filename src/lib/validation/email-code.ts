import { z } from 'zod';

/** Supabase Auth sends a code this long (`otp_length` in `supabase/config.toml`; the hosted dashboard must match). */
export const EMAIL_CODE_LENGTH = 6;

/** An email as typed: trimmed and lower-cased, so the same address always means the same account. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/** The digits from the sign-in email. */
export const emailCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`), `Enter the ${EMAIL_CODE_LENGTH}-digit code from your email`);
