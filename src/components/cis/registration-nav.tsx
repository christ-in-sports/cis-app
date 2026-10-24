'use client';

/**
 * `RegistrationNav`: the Registration section's tabs, at the top of the board
 * like Sports' (`SectionTabs`). The app's bottom bar keeps More lit here, since
 * these screens are reached from More.
 *
 * Which tabs appear depends on who is looking, because each role has a different
 * job here and a tab that leads to a screen you may not use is just a dead end:
 *   - a Parent registers their kids;
 *   - an Admin reads the roster and the servant registrations, imports the
 *     season's CSV and assigns roles.
 * A Parent alone has one tab, which `SectionTabs` does not show.
 */

import type { SectionNavItem } from '@/components/cis/section-nav';
import { SectionTabs } from '@/components/cis/section-tabs';

const REGISTER: SectionNavItem = { href: '/register', label: 'Register' };
const ROSTER: SectionNavItem = { href: '/registrations', label: 'Roster' };
const SERVANTS: SectionNavItem = { href: '/servants', label: 'Servants' };
const IMPORT: SectionNavItem = { href: '/admin/imports', label: 'Import' };
const ROLES: SectionNavItem = { href: '/admin/roles', label: 'Roles' };

export interface RegistrationNavRoles {
  isParent: boolean;
  /** Holds the `admin` role: the roster, servants, the CSV import and role assignment. */
  isAdmin: boolean;
}

/**
 * An Admin sees the roster and the import; a Parent who is also an Admin sees
 * both sets, so the two are merged in a fixed order rather than one replacing
 * the other.
 */
export function registrationNavItems({
  isParent,
  isAdmin,
}: RegistrationNavRoles): SectionNavItem[] {
  return [...(isParent ? [REGISTER] : []), ...(isAdmin ? [ROSTER, SERVANTS, IMPORT, ROLES] : [])];
}

export function RegistrationNav(props: RegistrationNavRoles) {
  return <SectionTabs label="Registration" items={registrationNavItems(props)} />;
}
