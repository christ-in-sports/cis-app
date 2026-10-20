import { z } from 'zod';

import { ASSIGNABLE_ROLES } from '@/lib/auth/app-roles';

/** One role granted to, or revoked from, one user. */
export const roleChangeSchema = z.object({
  userId: z.string().uuid('That is not a valid user'),
  role: z.enum(ASSIGNABLE_ROLES, 'That role cannot be changed here'),
});

export type RoleChange = z.infer<typeof roleChangeSchema>;
