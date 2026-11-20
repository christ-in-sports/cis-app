/**
 * Which Roles tab an account is listed on: parent-only accounts on Parents,
 * everyone else on Servants, kids on neither.
 */

import type { AppRole } from '@/lib/auth/app-roles';
import { isParentOnly, rolesHref, rolesViewFrom, splitByView } from './people';

const person = (id: string, roles: AppRole[]) => ({ id, roles });

describe('splitByView', () => {
  const people = [
    person('new-servant', []),
    person('coach', ['coach']),
    person('parent', ['parent']),
    person('coach-parent', ['coach', 'parent']),
    person('kid', ['kid']),
  ];

  it('lists parent-only accounts on Parents', () => {
    expect(splitByView(people).parents.map((p) => p.id)).toEqual(['parent']);
  });

  it('keeps servants, servants who are parents and people with no role on Servants', () => {
    expect(splitByView(people).servants.map((p) => p.id)).toEqual(['new-servant', 'coach', 'coach-parent']);
  });

  it('lists kid accounts on neither tab', () => {
    const { servants, parents } = splitByView(people);
    expect([...servants, ...parents].map((p) => p.id)).not.toContain('kid');
  });
});

describe('isParentOnly', () => {
  it('is false for an account with no role', () => {
    expect(isParentOnly([])).toBe(false);
  });
});

describe('the view in the URL', () => {
  it('defaults to Servants for anything but "parents"', () => {
    expect(rolesViewFrom(undefined)).toBe('servants');
    expect(rolesViewFrom('nonsense')).toBe('servants');
    expect(rolesViewFrom(['parents'])).toBe('servants');
    expect(rolesViewFrom('parents')).toBe('parents');
  });

  it('links each tab', () => {
    expect(rolesHref('servants')).toBe('/admin/roles');
    expect(rolesHref('parents')).toBe('/admin/roles?view=parents');
  });
});
