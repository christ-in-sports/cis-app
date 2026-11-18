/** Operational access shared by Director and Admin; RLS remains the boundary. */
import { checkAnyRole, type RoleCheck } from '@/lib/auth/roles';

export interface AdminCheck {
  supabase: RoleCheck['supabase'];
  userId: string | null;
  isAdmin: boolean;
}

/**
 * Resolves the caller's identity and whether they hold the `director` or `admin` role.
 *
 * Reads `user_roles`, the primitive `has_role()` is defined in terms of, so this
 * check stays aligned with the RLS policies it mirrors. See `checkAnyRole`.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const { supabase, userId, hasRole } = await checkAnyRole(['director', 'admin']);
  return { supabase, userId, isAdmin: hasRole };
}
