/**
 * Server-side role check.
 *
 * Generalises `checkAdmin()` to any of the six roles. Like it, this is a UX and
 * defence-in-depth layer, not the security boundary: RLS and the
 * `has_role()` checks inside the SECURITY DEFINER functions are. A bug here
 * produces a worse error message; it does not grant access.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

export type AppRole = 'admin' | 'program' | 'coach' | 'prayer' | 'parent' | 'kid';

export interface RoleCheck {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userId: string | null;
  hasRole: boolean;
}

/**
 * Resolves the caller's identity and whether they hold at least one of `roles`.
 * Reads `user_roles` (the "read own roles" policy makes it readable by the user
 * themselves), the same primitive `has_role()` is defined in terms of.
 *
 * Takes a list because some actions are open to more than one role (sports
 * results: Admin or Program Team, project_spec.md 1.5). A user holding several
 * of them has several rows, so this asks for any one row rather than expecting
 * exactly one.
 */
export async function checkAnyRole(roles: readonly AppRole[]): Promise<RoleCheck> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, hasRole: false };
  }

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', [...roles])
    .limit(1);

  return { supabase, userId: user.id, hasRole: (data?.length ?? 0) > 0 };
}

/** Whether the caller holds `role`. See `checkAnyRole`. */
export function checkRole(role: AppRole): Promise<RoleCheck> {
  return checkAnyRole([role]);
}
