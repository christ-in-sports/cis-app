/**
 * Server-side Admin check.
 *
 * `src/middleware.ts` deliberately excludes `/api`, and it only ever checks
 * whether someone is signed in -- never what they may do. So every server entry
 * point that is Admin-only has to establish that itself, and this is the one
 * place that knows how.
 *
 * This is a UX and defence-in-depth layer, not the security boundary. The real
 * boundary is RLS: `kids`, `registrations`, `import_batches` and `import_rows`
 * all restrict writes to `has_role('admin')`, and `import_commit()` re-checks
 * the same thing inside the database. A bug here produces a clearer error
 * message; it does not grant access.
 */

import { checkRole, type RoleCheck } from '@/lib/auth/roles';

export interface AdminCheck {
  supabase: RoleCheck['supabase'];
  userId: string | null;
  isAdmin: boolean;
}

/**
 * Resolves the caller's identity and whether they hold the `admin` role.
 *
 * Reads `user_roles` rather than the legacy `profiles.is_staff`: since the
 * six-role migration, `is_staff()` means admin *only*, but `user_roles` is the
 * primitive everything else is defined in terms of, and going through it keeps
 * this check aligned with the RLS policies it is mirroring. See `checkRole`.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const { supabase, userId, hasRole } = await checkRole('admin');
  return { supabase, userId, isAdmin: hasRole };
}
