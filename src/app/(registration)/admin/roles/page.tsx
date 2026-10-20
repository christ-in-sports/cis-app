/**
 * `/admin/roles` -- grant and remove roles.
 *
 * Admin-only. New servants sign up with the shared servant code and start with no
 * role (ENG-16); this is where an Admin gives them access. RLS is the boundary:
 * only an Admin can read everyone's `user_roles` or write them, so a non-Admin
 * who reached this page anyway would see only themselves and could change nothing.
 *
 * Servants only: an account holding the `kid` role is not listed. Kids get that
 * role automatically when they register, and are not people an Admin assigns
 * roles to.
 */

import { redirect } from 'next/navigation';

import { APP_ROLES, type AppRole } from '@/lib/auth/app-roles';
import { checkAdmin } from '@/lib/auth/admin';
import RolesClient, { type PersonRoles } from './roles-client';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) redirect('/login?redirect=/admin/roles');
  if (!isAdmin) redirect('/');

  const [{ data: profiles }, { data: grants }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email'),
    supabase.from('user_roles').select('user_id, role'),
  ]);

  const rolesByUser = new Map<string, AppRole[]>();
  for (const grant of grants ?? []) {
    if (!APP_ROLES.includes(grant.role)) continue;
    rolesByUser.set(grant.user_id, [...(rolesByUser.get(grant.user_id) ?? []), grant.role]);
  }

  const people: PersonRoles[] = (profiles ?? [])
    .filter((p) => !(rolesByUser.get(p.id) ?? []).includes('kid'))
    .map((p) => ({
      id: p.id,
      name: p.display_name,
      email: p.email,
      roles: rolesByUser.get(p.id) ?? [],
    }));

  return <RolesClient people={people} currentUserId={userId} />;
}
