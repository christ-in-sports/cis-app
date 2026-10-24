/**
 * The Registration tabs for whoever is looking, resolved on the server.
 *
 * This only decides which tabs are offered -- it grants nothing. Every screen
 * checks its own access (the pages redirect, and RLS is the real boundary), so a
 * mistake here shows someone a tab they cannot use; it never lets them in. A
 * roleless servant is sent to their form by the app shell's `ViewerAppNav`.
 */

import { RegistrationNav } from '@/components/cis/registration-nav';
import { getMyRoles } from '@/lib/auth/roles';

export async function ViewerNav() {
  const { roles } = await getMyRoles();
  return <RegistrationNav isAdmin={roles.has('admin')} isParent={roles.has('parent')} />;
}
