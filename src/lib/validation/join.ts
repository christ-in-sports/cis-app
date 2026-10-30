import { z } from 'zod';

import { emailCodeSchema, emailSchema } from './email-code';

/** The `code` in the join link. Its real check is `checkParentJoinCode`; this only bounds what is accepted. */
const joinCodeSchema = z.string().trim().min(1).max(200);

/** What a parent types into the join form. */
export const parentNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(100, 'That name is too long');

/** Ask for a sign-in code as a new or returning parent. */
export const sendJoinCodeSchema = z.object({
  code: joinCodeSchema,
  name: parentNameSchema,
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
