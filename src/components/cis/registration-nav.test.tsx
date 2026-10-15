/**
 * The Registration bottom nav: which tabs each kind of viewer gets, and which one
 * is marked current. A tab that leads somewhere you may not go is a dead end, so
 * the per-role sets are the thing worth pinning down.
 */

import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { RegistrationNav, registrationNavItems } from './registration-nav';

let pathname = '/register';
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));

const labels = (roles: Parameters<typeof registrationNavItems>[0]) =>
  registrationNavItems(roles).map((i) => i.label);

const none = { isParent: false, isStaff: false, isAdmin: false };

describe('registrationNavItems', () => {
  it('gives a parent Register, and no roster or import', () => {
    expect(labels({ ...none, isParent: true })).toEqual(['Home', 'Register', 'Sports']);
  });

  it('gives staff the roster but not the import', () => {
    expect(labels({ ...none, isStaff: true })).toEqual(['Home', 'Roster', 'Sports']);
  });

  it('gives an Admin the roster and the import', () => {
    expect(labels({ ...none, isStaff: true, isAdmin: true })).toEqual([
      'Home',
      'Roster',
      'Import',
      'Sports',
    ]);
  });

  // The Admin role alone is enough: Admin does not depend on the legacy
  // `profiles.is_staff` flag, which the roster page reads separately.
  it('treats an Admin as able to read the roster even without the staff flag', () => {
    expect(labels({ ...none, isAdmin: true })).toContain('Roster');
  });

  it('merges the sets for someone who is both a parent and an Admin, in a fixed order', () => {
    expect(labels({ isParent: true, isStaff: true, isAdmin: true })).toEqual([
      'Home',
      'Register',
      'Roster',
      'Import',
      'Sports',
    ]);
  });

  it('gives a user with no registration role only Home and Sports', () => {
    expect(labels(none)).toEqual(['Home', 'Sports']);
  });
});

describe('RegistrationNav', () => {
  const all = { isParent: true, isStaff: true, isAdmin: true };

  function current() {
    const nav = screen.getByRole('navigation', { name: 'Registration' });
    return within(nav)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page')
      .map((a) => a.textContent);
  }

  it.each([
    ['/register', 'Register'],
    ['/registrations', 'Roster'],
    ['/admin/imports', 'Import'],
  ])('marks only %s as current', (path, label) => {
    pathname = path;
    render(<RegistrationNav {...all} />);
    expect(current()).toEqual([label]);
  });

  // `/register` is a string prefix of `/registrations`; only a path boundary counts.
  it('does not light Register on the roster page', () => {
    pathname = '/registrations';
    render(<RegistrationNav {...all} />);
    expect(current()).not.toContain('Register');
  });

  it('never marks Home as current, because it leaves the section', () => {
    pathname = '/';
    render(<RegistrationNav {...all} />);
    expect(current()).toEqual([]);
  });

  it('links each tab to its screen', () => {
    pathname = '/register';
    render(<RegistrationNav {...all} />);
    const nav = screen.getByRole('navigation', { name: 'Registration' });
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/register', '/registrations', '/admin/imports', '/sports']);
  });
});
