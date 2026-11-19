import { z } from 'zod';

import { emailCodeSchema, emailSchema } from './email-code';

/** The `code` in the join link. Its real check is `checkParentJoinCode`; this only bounds what is accepted. */
const joinCodeSchema = z.string().trim().min(1).max(200);

/** The parent's first and last name, typed separately on the join form. */
export const parentFirstNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your first name')
  .max(50, 'That name is too long');

export const parentLastNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your last name')
  .max(50, 'That name is too long');

/** "First Last", as the account's display name: profiles keep one name, like servant registration's full_name. */
export const parentDisplayName = (firstName: string, lastName: string) => `${firstName.trim()} ${lastName.trim()}`;

/** Ask for a sign-in code as a new or returning parent. */
export const sendJoinCodeSchema = z.object({
  code: joinCodeSchema,
  firstName: parentFirstNameSchema,
  lastName: parentLastNameSchema,
  email: emailSchema,
});

/** Check the emailed code, then grant Parent. */
export const verifyJoinCodeSchema = z.object({
  code: joinCodeSchema,
  email: emailSchema,
  token: emailCodeSchema,
});

export type SendJoinCode = z.infer<typeof sendJoinCodeSchema>;
export type VerifyJoinCode = z.infer<typeof verifyJoinCodeSchema>;
