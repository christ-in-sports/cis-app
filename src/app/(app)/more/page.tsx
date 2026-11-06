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
import { SignOutButton } from '@/components/cis/sign-out-button';
import { getMyRoles } from '@/lib/auth/roles';
import { SERVANT_REGISTRATION_PATH } from '@/lib/auth/servant-gate';

export default async function MorePage() {
  const { userId, roles } = await getMyRoles();
  if (!userId) redirect('/login?redirect=/more');
  if (roles.size === 0) redirect(SERVANT_REGISTRATION_PATH);

  const isAdmin = roles.has('admin');
  const manages = isAdmin || roles.has('program');
  // Servant registration is for servants: Admin, Program, Coach or Prayer. A Parent
  // or Kid account is not one, and the page and the database refuse them too.
  const isServant = isAdmin || roles.has('program') || roles.has('coach') || roles.has('prayer');

  return (
    <>
      <BoardHeader title="More" />
      <RegistrationColumn>
        {isServant && (
          <MenuSheet heading="You">
            <MenuRow href={SERVANT_REGISTRATION_PATH} title="My registration" icon="user" />
          </MenuSheet>
        )}
        {roles.has('parent') && (
          <MenuSheet heading="Your kids">
            <MenuRow href="/register" title="Register a kid" icon="register" />
          </MenuSheet>
        )}
        {isAdmin && (
          <MenuSheet heading="Season">
            <MenuRow href="/registrations" title="CISers" icon="roster" />
            <MenuRow href="/servants" title="Servants" icon="servants" />
            <MenuRow href="/admin/imports" title="Roster import" icon="import" />
            <MenuRow href="/admin/roles" title="Roles" icon="roles" />
          </MenuSheet>
        )}
        {manages && (
          <MenuSheet heading="Teams">
            <MenuRow href="/teams" title="Manage teams" icon="roster" />
          </MenuSheet>
        )}
        {manages && (
          <MenuSheet heading="Archives">
            <MenuRow href="/attendance/archive" title="Attendance archive" icon="archive" />
            <MenuRow href="/teams?view=archive" title="Team archive" icon="archive" />
          </MenuSheet>
        )}
        <SignOutButton />
      </RegistrationColumn>
    </>
  );
}
