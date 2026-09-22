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

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface AdminCheck {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userId: string | null;
  isAdmin: boolean;
}

/**
 * Resolves the caller's identity and whether they hold the `admin` role.
 *
 * Reads `user_roles` rather than the legacy `profiles.is_staff`: since the
 * six-role migration, `is_staff()` means admin *only*, but `user_roles` is the
 * primitive everything else is defined in terms of, and going through it keeps
 * this check aligned with the RLS policies it is mirroring. The "read own
 * roles" policy is what makes this readable by the user themselves.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, isAdmin: false };
  }

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  return { supabase, userId: user.id, isAdmin: data !== null };
}
