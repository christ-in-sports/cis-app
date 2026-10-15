/**
 * The Registration nav for whoever is looking, resolved on the server.
 *
 * This only decides which tabs are offered -- it grants nothing. Every screen
 * checks its own access (the pages redirect, and RLS is the real boundary), so a
 * mistake here shows someone a tab they cannot use; it never lets them in.
 *
 * Async, so the layout renders it inside `Suspense`: the board and a placeholder
 * nav appear straight away and the right tabs stream in once the roles are read.
 */

import { RegistrationNav } from '@/components/cis/registration-nav';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function ViewerNav() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <RegistrationNav isParent={false} isStaff={false} isAdmin={false} />;

  // `is_staff` is the legacy profile flag the roster page also reads for its
  // "Staff only" gate; Admin comes from `user_roles`, which is what the import
  // screen and RLS actually check.
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('is_staff').eq('id', user.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'parent']),
  ]);

  return (
    <RegistrationNav
      isStaff={!!profile?.is_staff}
      isAdmin={(roles ?? []).some((r) => r.role === 'admin')}
      isParent={(roles ?? []).some((r) => r.role === 'parent')}
    />
  );
}
