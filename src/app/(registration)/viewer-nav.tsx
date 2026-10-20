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
import { getMyRoles } from '@/lib/auth/roles';

export async function ViewerNav() {
  const { userId, roles } = await getMyRoles();

  if (!userId) return <RegistrationNav isParent={false} isAdmin={false} />;

  return <RegistrationNav isAdmin={roles.has('admin')} isParent={roles.has('parent')} />;
}
