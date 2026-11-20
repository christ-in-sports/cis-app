/**
 * Which tab of the Roles screen an account is listed on.
 *
 * Parents join through the parent link and get Parent and nothing else; there
 * are hundreds of them, and a Director rarely needs to touch them. They go on
 * the Parents tab so the servants a Director manages are not buried. Anyone who
 * holds Parent plus another role is a servant who is also a parent, and stays
 * on Servants. An account with no role at all is on Servants too: that is a new
 * servant waiting for access (or a parent whose Parent role was removed).
 *
 * Kid accounts are on neither: kids get their role when they register and are
 * not people a Director assigns roles to.
 */

import type { AppRole } from '@/lib/auth/app-roles';

export type RolesView = 'servants' | 'parents';

export const rolesViewFrom = (view: string | string[] | undefined): RolesView =>
  view === 'parents' ? 'parents' : 'servants';

export const rolesHref = (view: RolesView) =>
  view === 'parents' ? '/admin/roles?view=parents' : '/admin/roles';

export const isParentOnly = (roles: readonly AppRole[]) =>
  roles.length > 0 && roles.every((r) => r === 'parent');

export function splitByView<P extends { roles: readonly AppRole[] }>(
  people: readonly P[],
): Record<RolesView, P[]> {
  const listed = people.filter((p) => !p.roles.includes('kid'));
  return {
    servants: listed.filter((p) => !isParentOnly(p.roles)),
    parents: listed.filter((p) => isParentOnly(p.roles)),
  };
}
