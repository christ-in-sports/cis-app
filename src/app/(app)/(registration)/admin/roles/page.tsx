/**
 * `/admin/roles` -- grant and remove roles.
 *
 * Director-only. New servants sign up with the shared servant code and start with no
 * role (ENG-16); this is where a Director gives them access. RLS is the boundary:
 * only a Director can read everyone's `user_roles` or write them, so a non-Director
 * who reached this page anyway would see only themselves and could change nothing.
 *
 * Two tabs (`?view=`): Servants, the default, and Parents, the accounts whose only
 * role is Parent. Kid accounts are on neither (`people.ts`).
 */

import { redirect } from 'next/navigation';

import { SheetTabs } from '@/components/cis/sheet-tabs';
import { APP_ROLES, type AppRole } from '@/lib/auth/app-roles';
import { checkRole } from '@/lib/auth/roles';
import { rolesHref, rolesViewFrom, splitByView } from './people';
import RolesClient, { type PersonRoles } from './roles-client';

export const dynamic = 'force-dynamic';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = rolesViewFrom((await searchParams).view);
  const { supabase, userId, hasRole } = await checkRole('director');

  if (userId === null) redirect(`/login?redirect=${encodeURIComponent(rolesHref(view))}`);
  if (!hasRole) redirect('/');

  const [{ data: profiles }, { data: grants }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email'),
    supabase.from('user_roles').select('user_id, role'),
  ]);

  const rolesByUser = new Map<string, AppRole[]>();
  for (const grant of grants ?? []) {
    if (!APP_ROLES.includes(grant.role)) continue;
    rolesByUser.set(grant.user_id, [...(rolesByUser.get(grant.user_id) ?? []), grant.role]);
  }

  const lists = splitByView<PersonRoles>(
    (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.display_name,
      email: p.email,
      roles: rolesByUser.get(p.id) ?? [],
    })),
  );

  const tabs = (
    <SheetTabs
      label="Accounts"
      value={view}
      className="px-0 pt-0"
      tabs={[
        { key: 'servants', name: 'Servants', note: count(lists.servants.length, 'account', 'accounts'), href: rolesHref('servants') },
        { key: 'parents', name: 'Parents', note: count(lists.parents.length, 'account', 'accounts'), href: rolesHref('parents') },
      ]}
    />
  );

  return <RolesClient key={view} view={view} tabs={tabs} people={lists[view]} currentUserId={userId} />;
}
