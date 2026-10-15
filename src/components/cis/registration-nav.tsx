'use client';

/**
 * `RegistrationNav`: the bottom nav of the Registration section, the same bar as
 * Sports' (`SectionNav`) with Registration's own items.
 *
 * Which items appear depends on who is looking, because each role has a different
 * job here and a tab that leads to a screen you may not use is just a dead end:
 *   - a Parent registers their kids;
 *   - staff read the roster;
 *   - an Admin also imports the season's CSV.
 * Everyone gets Home (back to the app) and a Sports shortcut. These item sets are
 * a proposal built from the Sports pattern, not an agreed design
 * (`DESIGN_SYSTEM.md` §10).
 */

import { SectionNav, type SectionNavItem } from '@/components/cis/section-nav';

const HOME: SectionNavItem = { href: '/', label: 'Home', icon: 'home' };
const SPORTS: SectionNavItem = { href: '/sports', label: 'Sports', icon: 'sports' };
const REGISTER: SectionNavItem = { href: '/register', label: 'Register', icon: 'register' };
const ROSTER: SectionNavItem = { href: '/registrations', label: 'Roster', icon: 'roster' };
const IMPORT: SectionNavItem = { href: '/admin/imports', label: 'Import', icon: 'import' };

export interface RegistrationNavRoles {
  isParent: boolean;
  /** Anyone who may read the roster. */
  isStaff: boolean;
  /** Admin only: the CSV import. */
  isAdmin: boolean;
}

/**
 * Staff and Admin see the roster; a Parent who is also staff sees both sets, so
 * the two are merged in a fixed order rather than one replacing the other.
 */
export function registrationNavItems({
  isParent,
  isStaff,
  isAdmin,
}: RegistrationNavRoles): SectionNavItem[] {
  const canReadRoster = isStaff || isAdmin;
  return [
    HOME,
    ...(isParent ? [REGISTER] : []),
    ...(canReadRoster ? [ROSTER] : []),
    ...(isAdmin ? [IMPORT] : []),
    SPORTS,
  ];
}

export function RegistrationNav(props: RegistrationNavRoles) {
  return <SectionNav label="Registration" items={registrationNavItems(props)} />;
}
