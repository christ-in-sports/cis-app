/**
 * Sends a signed-in user who has no role yet to the servant registration form.
 *
 * A new servant signs up with the shared code and holds no role until an Admin
 * assigns one, so until then the form is the only thing they can use. Call it
 * from the home page and the layouts of the role-gated areas. It is UX only:
 * RLS already returns nothing to a roleless user, and a signed-out visitor is
 * left alone here because the middleware and each page send them to login.
 */

import { redirect } from 'next/navigation';

import { hasAnyRole } from './roles';

export const SERVANT_REGISTRATION_PATH = '/servant-registration';

export async function redirectIfRoleless(): Promise<void> {
  const { userId, hasRole } = await hasAnyRole();
  if (userId !== null && !hasRole) redirect(SERVANT_REGISTRATION_PATH);
}
