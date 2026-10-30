import { z } from 'zod';

import { emailSchema } from '@/lib/validation/email-code';

/** An Admin looks up the parent account a kid should be attached to. */
export const findParentSchema = z.object({
  email: emailSchema,
});

/** An Admin attaches one kid to the parent account that has this email. */
export const attachParentSchema = z.object({
  kidId: z.string().uuid('That is not a valid kid'),
  email: emailSchema,
});

export type AttachParent = z.infer<typeof attachParentSchema>;
