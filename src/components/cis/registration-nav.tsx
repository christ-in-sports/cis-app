'use client';

/**
 * `RegistrationNav`: the Registration section's tabs, at the top of the board
 * like Sports' (`SectionTabs`). The app's bottom bar keeps More lit here, since
 * these screens are reached from More.
 *
 * Parents register their kids. Director and Admin can use the roster and import;
 * only Director can view servant registrations or assign roles.
 */

import type { SectionNavItem } from '@/components/cis/section-nav';
import { SectionTabs } from '@/components/cis/section-tabs';

const REGISTER: SectionNavItem = { href: '/register', label: 'Register' };
const ROSTER: SectionNavItem = { href: '/registrations', label: 'CISers' };
const SERVANTS: SectionNavItem = { href: '/servants', label: 'Servants' };
const IMPORT: SectionNavItem = { href: '/admin/imports', label: 'Import' };
const ROLES: SectionNavItem = { href: '/admin/roles', label: 'Roles' };

export interface RegistrationNavRoles {
  isParent: boolean;
  /** Holds Admin: roster and CSV import only. */
  isAdmin: boolean;
  /** Holds Director: includes servant oversight and role assignment. */
  isDirector?: boolean;
}

/**
 * An Admin sees the roster and the import; a Parent who is also an Admin sees
 * both sets, so the two are merged in a fixed order rather than one replacing
 * the other.
 */
export function registrationNavItems({
  isParent,
  isAdmin,
  isDirector = false,
}: RegistrationNavRoles): SectionNavItem[] {
  return [
    ...(isParent ? [REGISTER] : []),
    ...((isDirector || isAdmin) ? [ROSTER] : []),
    ...(isDirector ? [SERVANTS] : []),
    ...((isDirector || isAdmin) ? [IMPORT] : []),
    ...(isDirector ? [ROLES] : []),
  ];
}

export function RegistrationNav(props: RegistrationNavRoles) {
  return <SectionTabs label="Registration" items={registrationNavItems(props)} />;
}
