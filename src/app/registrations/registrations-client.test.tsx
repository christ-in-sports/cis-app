/**
 * Covers the roster row's tap behaviour.
 *
 * The details panel is the only way to reach a kid's guardian, address and
 * emergency contact, and on a phone the control that opens it used to be a
 * three-word name. The whole row is the target now, which puts it next to two
 * things it must not swallow: the consent checkbox, and keyboard access.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import RegistrationsClient, { type RosterEntry } from './registrations-client';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: jest.fn() }),
}));

const toast = jest.fn();
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast }),
}));

jest.mock('./actions', () => ({
  setRegistrationsConsent: jest.fn(),
}));

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    registration_id: 'reg-1',
    grade: 6,
    division: 'juniors',
    tshirt_size: 'YM',
    top_sports: null,
    active: true,
    consent_given_at: null,
    team_id: null,
    kid: {
      id: 'kid-1',
      first_name: 'Mina',
      last_name: 'Guirguis',
      dob: '2014-03-02',
      gender: 'male',
      allergies: null,
      home_address: '1 Church Way, Hayward, CA',
      email: null,
      phone: null,
      emergency_contact_name: 'Mariam Guirguis',
      emergency_contact_phone: '(510) 555-0111',
      guardian_name: 'Mariam Guirguis',
      guardian_phone: '(510) 555-0111',
      guardian_email: 'mariam@example.com',
    },
    ...overrides,
  };
}

function renderRoster(opts: { isAdmin?: boolean; rows?: RosterEntry[] } = {}) {
  return render(
    <RegistrationsClient
      initial={opts.rows ?? [entry()]}
      isStaff
      isAdmin={opts.isAdmin ?? true}
      season={{ id: 'season-1', name: '2026' }}
    />,
  );
}

/** The row carrying the name, as opposed to the panel row beneath it. */
function nameToggle() {
  return screen.getByRole('button', { name: 'Guirguis, Mina' });
}

const detailsAreOpen = () => screen.queryByText('Emergency contact') !== null;

describe('roster row -- opening a kid\'s details', () => {
  it('opens when a cell other than the name is tapped', () => {
    renderRoster();
    expect(detailsAreOpen()).toBe(false);

    // The division cell: as far from the name link as the row gets.
    fireEvent.click(screen.getByText('Juniors'));

    expect(detailsAreOpen()).toBe(true);
    expect(nameToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens on the name itself without the click counting twice', () => {
    // The name is inside the clickable row, so a handler on both would toggle
    // open and straight back shut.
    renderRoster();

    fireEvent.click(nameToggle());

    expect(detailsAreOpen()).toBe(true);
  });

  it('closes again on a second tap anywhere in the row', () => {
    renderRoster();

    fireEvent.click(screen.getByText('Juniors'));
    fireEvent.click(screen.getByText('Juniors'));

    expect(detailsAreOpen()).toBe(false);
  });

  it('stays reachable without a pointer', () => {
    // The row is a <tr>, which nothing can focus -- the name button is what
    // keeps the panel operable by keyboard, so it has to stay a real button.
    renderRoster();
    const toggle = nameToggle();

    toggle.focus();
    expect(toggle).toHaveFocus();

    // Enter on a focused button raises a click, which is what the row handles.
    fireEvent.click(toggle);

    expect(detailsAreOpen()).toBe(true);
  });

  it('shows the contact details that are only in the panel', () => {
    renderRoster();

    fireEvent.click(screen.getByText('Juniors'));

    expect(screen.getByText('mariam@example.com')).toBeInTheDocument();
    expect(screen.getByText('1 Church Way, Hayward, CA')).toBeInTheDocument();
  });
});

describe('roster row -- the consent checkbox is not a tap on the row', () => {
  /** Turns on the "still owe a consent form" filter, which reveals the boxes. */
  function enterConsentMode() {
    fireEvent.click(screen.getByRole('button', { name: /still owe a consent form/i }));
  }

  it('ticks the box without springing the panel open', () => {
    renderRoster();
    enterConsentMode();

    const box = screen.getByRole('checkbox', {
      name: 'Consent form received for Mina Guirguis',
    });
    fireEvent.click(box);

    expect(box).toBeChecked();
    expect(detailsAreOpen()).toBe(false);
  });

  it('still opens the panel from the rest of the row while marking consent', () => {
    renderRoster();
    enterConsentMode();

    fireEvent.click(screen.getByText('Juniors'));

    expect(detailsAreOpen()).toBe(true);
  });

  it('leaves the box alone when the row is opened', () => {
    renderRoster();
    enterConsentMode();

    fireEvent.click(screen.getByText('Juniors'));

    expect(
      screen.getByRole('checkbox', { name: 'Consent form received for Mina Guirguis' }),
    ).not.toBeChecked();
  });
});

describe('roster row -- rows are independent', () => {
  it('opening one kid does not open another', () => {
    renderRoster({
      rows: [
        entry(),
        entry({
          registration_id: 'reg-2',
          grade: 9,
          division: 'ambassadors',
          kid: { ...entry().kid, id: 'kid-2', first_name: 'Peter', last_name: 'Sedra' },
        }),
      ],
    });

    fireEvent.click(screen.getByText('Juniors'));

    const panels = screen.getAllByText('Emergency contact');
    expect(panels).toHaveLength(1);
    expect(within(screen.getByRole('table')).getByRole('button', { name: 'Sedra, Peter' }))
      .toHaveAttribute('aria-expanded', 'false');
  });
});
