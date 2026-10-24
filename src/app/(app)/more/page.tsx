/**
 * `/more` -- everything that is not a daily job: your own servant registration,
 * your kids, the Admin's season tools, and signing out. The screens it links to
 * keep More lit in the bottom bar (`AppNav`).
 *
 * Each group appears only for the roles that may use its screens
 * (`project_spec.md` §1.5); the screens check access again and RLS is the
 * boundary.
 */

import { redirect } from 'next/navigation';

import { BoardHeader } from '@/components/cis/board-shell';
import { MenuRow, MenuSheet } from '@/components/cis/menu-list';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { ASSIGNABLE_ROLES } from '@/lib/auth/app-roles';
import { getMyRoles } from '@/lib/auth/roles';
import { SERVANT_REGISTRATION_PATH } from '@/lib/auth/servant-gate';

import { SignOutButton } from './sign-out-button';

export default async function MorePage() {
  const { userId, roles } = await getMyRoles();
  if (!userId) redirect('/login?redirect=/more');
  if (roles.size === 0) redirect(SERVANT_REGISTRATION_PATH);

  const isAdmin = roles.has('admin');
  const manages = isAdmin || roles.has('program');
  // Servant registration is for the servant roles; a kid's account has nothing to submit.
  const isServant = ASSIGNABLE_ROLES.some((r) => roles.has(r));

  return (
    <>
      <BoardHeader title="More" />
      <RegistrationColumn>
        {isServant && (
          <MenuSheet heading="You">
            <MenuRow href={SERVANT_REGISTRATION_PATH} title="My servant registration" note="Your season details and sub-teams" />
          </MenuSheet>
        )}
        {roles.has('parent') && (
          <MenuSheet heading="Your kids">
            <MenuRow href="/register" title="Register a kid" note="New registrations and ones still in progress" />
          </MenuSheet>
        )}
        {isAdmin && (
          <MenuSheet heading="Season">
            <MenuRow href="/registrations" title="Roster" note="Every registered kid, consent and payments" />
            <MenuRow href="/servants" title="Servants" note="This season's servant registrations" />
            <MenuRow href="/admin/imports" title="Roster import" note="Bring in the season's CSV" />
            <MenuRow href="/admin/roles" title="Roles" note="Give servants their roles" />
          </MenuSheet>
        )}
        {manages && (
          <MenuSheet heading="Archives">
            <MenuRow href="/attendance/archive" title="Attendance archive" note="Past seasons' days and marks" />
            <MenuRow href="/attendance/teams?view=archive" title="Team archive" note="Retired teams and their rosters" />
          </MenuSheet>
        )}
        <SignOutButton />
      </RegistrationColumn>
    </>
  );
}
