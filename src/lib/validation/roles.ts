import { z } from 'zod';

import { APP_ROLES } from '@/lib/auth/app-roles';

/** One role granted to, or revoked from, one user. */
export const roleChangeSchema = z.object({
  userId: z.string().uuid('That is not a valid user'),
  role: z.enum(APP_ROLES, 'That is not a role'),
});

export type RoleChange = z.infer<typeof roleChangeSchema>;
