/**
 * The app bar for whoever is looking, resolved on the server.
 *
 * This only decides which tabs are offered -- it grants nothing. Every screen
 * checks its own access (the pages redirect, and RLS is the real boundary), so a
 * mistake here shows someone a tab they cannot use; it never lets them in.
 *
 * Async, so the layout renders it inside `Suspense`: the board and a placeholder
 * bar appear straight away and the right tabs stream in once the roles are read.
 */

import { redirect } from 'next/navigation';

import { AppNav } from '@/components/cis/app-nav';
import { getMyRoles } from '@/lib/auth/roles';
import { SERVANT_REGISTRATION_PATH } from '@/lib/auth/servant-gate';

export async function ViewerAppNav() {
  const { userId, roles } = await getMyRoles();

  if (!userId) return <AppNav roles={[]} />;

  // A new servant has no role yet and sees nothing here; send them to the form.
  // This runs where the roles are already read, so it adds no query.
  if (roles.size === 0) redirect(SERVANT_REGISTRATION_PATH);

  return <AppNav roles={[...roles]} />;
}
