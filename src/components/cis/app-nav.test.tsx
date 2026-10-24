/**
 * The app's bottom bar: which items each role gets, and which one is lit. A tab
 * that leads somewhere you may not go is a dead end, so the per-role sets are the
 * thing worth pinning down (`project_spec.md` §1.5).
 */

import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import type { AppRole } from '@/lib/auth/app-roles';

import { AppNav, appNavItems } from './app-nav';

let pathname = '/';
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));

const labels = (...roles: AppRole[]) => appNavItems(new Set(roles)).map((i) => i.label);

describe('appNavItems', () => {
  it.each<[AppRole[], string[]]>([
    [['admin'], ['Today', 'Sports', 'Attendance', 'More']],
    [['program'], ['Today', 'Sports', 'Attendance', 'More']],
    [['coach'], ['Today', 'Sports', 'My team', 'More']],
    [['prayer'], ['Today', 'Sports', 'More']],
    [['parent'], ['Today', 'Sports', 'More']],
    [['kid'], ['Today', 'Sports', 'More']],
  ])('gives %j %j', (roles, expected) => {
    expect(labels(...roles)).toEqual(expected);
  });

  it('calls attendance "Attendance" for a Coach who also manages it', () => {
    expect(labels('coach', 'program')).toEqual(['Today', 'Sports', 'Attendance', 'More']);
  });

  it('merges roles without repeating an item', () => {
    expect(labels('admin', 'coach', 'parent', 'prayer')).toEqual(['Today', 'Sports', 'Attendance', 'More']);
  });

  it('shows the items everyone has before roles are known', () => {
    expect(labels()).toEqual(['Today', 'Sports', 'More']);
  });
});

describe('AppNav', () => {
  function current() {
    const nav = screen.getByRole('navigation', { name: 'App' });
    return within(nav)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page')
      .map((a) => a.textContent);
  }

  it.each([
    ['/', 'Today'],
    ['/sports', 'Sports'],
    ['/sports/schedule', 'Sports'],
    ['/attendance', 'Attendance'],
    ['/attendance/b885f8bc-347d-4a99-82ea-d36bb1b35554/codes', 'Attendance'],
    ['/more', 'More'],
    ['/teams', 'More'],
    ['/registrations', 'More'],
    ['/register', 'More'],
    ['/servants', 'More'],
    ['/admin/roles', 'More'],
  ])('lights only one item on %s', (path, label) => {
    pathname = path;
    render(<AppNav roles={['admin']} />);
    expect(current()).toEqual([label]);
  });

  it('links each item to its section', () => {
    pathname = '/';
    render(<AppNav roles={['coach']} />);
    const hrefs = within(screen.getByRole('navigation', { name: 'App' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/sports', '/attendance', '/more']);
  });
});
