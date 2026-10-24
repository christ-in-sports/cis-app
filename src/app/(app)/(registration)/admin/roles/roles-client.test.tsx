/**
 * The Admin roles screen: who is listed first, that a tick is saved and shown at
 * once, that a failed save is put back with a reason, and that an Admin cannot
 * untick their own Admin box.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import RolesClient, { type PersonRoles } from './roles-client';
import { grantRole, revokeRole } from './actions';

jest.mock('./actions', () => ({
  grantRole: jest.fn(),
  revokeRole: jest.fn(),
}));

const grantRoleMock = grantRole as jest.MockedFunction<typeof grantRole>;
const revokeRoleMock = revokeRole as jest.MockedFunction<typeof revokeRole>;

const me: PersonRoles = { id: 'me', name: 'Dina Admin', email: 'dina@example.com', roles: ['admin'] };
const newServant: PersonRoles = { id: 'new', name: 'Nabil New', email: 'nabil@example.com', roles: [] };
const coach: PersonRoles = { id: 'coach', name: 'Carol Coach', email: 'carol@example.com', roles: ['coach'] };

function renderRoles(people: PersonRoles[] = [me, coach, newServant]) {
  return render(<RolesClient people={people} currentUserId="me" />);
}

const box = (role: string, person: string) =>
  screen.getByRole('checkbox', { name: `${role} for ${person}` });

beforeEach(() => {
  grantRoleMock.mockReset().mockResolvedValue({ ok: true });
  revokeRoleMock.mockReset().mockResolvedValue({ ok: true });
});

describe('the roles screen', () => {
  it('lists people with no role first, then by name', () => {
    renderRoles();

    const names = screen
      .getAllByRole('region')
      .map((section) => section.getAttribute('aria-label'));
    expect(names).toEqual(['Nabil New', 'Carol Coach', 'Dina Admin']);
  });

  it('says how many people are waiting for a role', () => {
    renderRoles();
    expect(screen.getByText(/1 has no role yet/)).toBeInTheDocument();
  });

  it('saves a ticked role and shows it straight away', async () => {
    renderRoles();

    await act(async () => {
      fireEvent.click(box('Coach', 'Nabil New'));
    });

    expect(grantRoleMock).toHaveBeenCalledWith('new', 'coach');
    expect(box('Coach', 'Nabil New')).toBeChecked();
    expect(screen.getByText(/everyone has a role/)).toBeInTheDocument();
  });

  it('removes an unticked role', async () => {
    renderRoles();

    await act(async () => {
      fireEvent.click(box('Coach', 'Carol Coach'));
    });

    expect(revokeRoleMock).toHaveBeenCalledWith('coach', 'coach');
    expect(box('Coach', 'Carol Coach')).not.toBeChecked();
  });

  it('puts the box back and says why when a save fails', async () => {
    grantRoleMock.mockResolvedValue({ ok: false, error: 'Only Admins can change roles.' });
    renderRoles();

    await act(async () => {
      fireEvent.click(box('Prayer Team', 'Nabil New'));
    });

    expect(box('Prayer Team', 'Nabil New')).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('Only Admins can change roles.');
  });

  it('does not let an Admin untick their own Admin box, and explains', async () => {
    renderRoles();

    expect(box('Admin', 'Dina Admin')).toBeDisabled();
    expect(screen.getByText(/can't remove your own Admin role/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(box('Admin', 'Dina Admin'));
    });
    expect(revokeRoleMock).not.toHaveBeenCalled();
  });

  it('offers the servant roles and never Kid', () => {
    renderRoles();

    const names = screen
      .getAllByRole('checkbox')
      .map((c) => c.getAttribute('aria-label') ?? c.closest('label')?.textContent?.replace('✓', ''));
    expect(names.every((n) => !/kid/i.test(n ?? ''))).toBe(true);
    expect(screen.queryByRole('checkbox', { name: /^Kid for/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: /^Parent for/ })).toHaveLength(3);
  });

  it('shows the reason under the person it happened to, not at the top of the list', async () => {
    grantRoleMock.mockResolvedValue({ ok: false, error: 'Only Admins can change roles.' });
    renderRoles();

    await act(async () => {
      fireEvent.click(box('Prayer Team', 'Nabil New'));
    });

    const row = screen.getByRole('region', { name: 'Nabil New' });
    expect(row).toHaveTextContent('Only Admins can change roles.');
    expect(screen.getByRole('region', { name: 'Carol Coach' })).not.toHaveTextContent('Only Admins');
  });

  it('puts the box back when the request itself fails', async () => {
    grantRoleMock.mockRejectedValue(new Error('network'));
    renderRoles();

    await act(async () => {
      fireEvent.click(box('Prayer Team', 'Nabil New'));
    });

    expect(box('Prayer Team', 'Nabil New')).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i);

    // The box is usable again, not stuck as "saving".
    grantRoleMock.mockResolvedValue({ ok: true });
    await act(async () => {
      fireEvent.click(box('Prayer Team', 'Nabil New'));
    });
    expect(box('Prayer Team', 'Nabil New')).toBeChecked();
  });

  it('lets an Admin change another Admin', () => {
    renderRoles([me, { id: 'other', name: 'Omar Admin', email: 'omar@example.com', roles: ['admin'] }]);
    expect(box('Admin', 'Omar Admin')).toBeEnabled();
  });

  it('filters by name or email', () => {
    renderRoles();

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'carol@' } });

    expect(screen.getByRole('region', { name: 'Carol Coach' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Nabil New' })).not.toBeInTheDocument();
  });

  it('keeps rows where they are when a role is ticked', async () => {
    renderRoles();

    await act(async () => {
      fireEvent.click(box('Coach', 'Nabil New'));
    });

    const names = screen.getAllByRole('region').map((s) => s.getAttribute('aria-label'));
    expect(names[0]).toBe('Nabil New');
  });
});
