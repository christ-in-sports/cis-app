/**
 * Covers the roster row's tap behaviour.
 *
 * The details panel is the only way to reach a kid's guardian, address and
 * emergency contact, and on a phone the control that opens it used to be a
 * three-word name. The whole row is the target now, which puts it next to two
 * things it must not swallow: the consent checkbox, and keyboard access.
 *
 * Also covers recording payments (ENG-9): the "haven't paid" chase mode, the
 * bulk bar, and the per-kid Payments block.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import RegistrationsClient, { type RosterEntry } from './registrations-client';
import { deletePayment, recordPayments } from './actions';

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
  recordPayments: jest.fn(),
  deletePayment: jest.fn(),
}));

const recordPaymentsMock = recordPayments as jest.MockedFunction<typeof recordPayments>;
const deletePaymentMock = deletePayment as jest.MockedFunction<typeof deletePayment>;

beforeEach(() => {
  jest.clearAllMocks();
});

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
    payments: [],
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

const peter = () =>
  entry({
    registration_id: 'reg-2',
    grade: 9,
    division: 'ambassadors',
    kid: { ...entry().kid, id: 'kid-2', first_name: 'Peter', last_name: 'Sedra' },
  });

const paid = () =>
  entry({
    registration_id: 'reg-3',
    kid: { ...entry().kid, id: 'kid-3', first_name: 'Marina', last_name: 'Abdo' },
    payments: [{ id: 'pay-1', amount_cents: 4000, method: 'venmo', received_at: '2026-10-01T18:00:00Z' }],
  });

describe('payments -- the "haven\'t paid" chase mode', () => {
  const enterPaymentMode = () =>
    fireEvent.click(screen.getByRole('button', { name: /haven't paid/i }));

  it('counts only kids with no payment at all, and narrows the roster to them', () => {
    renderRoster({ rows: [entry(), peter(), paid()] });

    enterPaymentMode();

    expect(screen.getByRole('button', { name: "2 haven't paid" })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Abdo, Marina' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guirguis, Mina' })).toBeInTheDocument();
  });

  // Payments are hidden from every role but Admin, so to anyone else the whole
  // roster would read as unpaid.
  it('is not offered to staff who are not Admin', () => {
    renderRoster({ isAdmin: false });

    expect(screen.queryByRole('button', { name: /haven't paid/i })).not.toBeInTheDocument();
  });

  it('records one payment for every ticked kid in a single call', async () => {
    recordPaymentsMock.mockResolvedValue({
      ok: true,
      payments: [
        { id: 'p-a', registrationId: 'reg-1', amountCents: 8500, method: 'cash', receivedAt: '2026-10-05T18:00:00Z' },
        { id: 'p-b', registrationId: 'reg-2', amountCents: 8500, method: 'cash', receivedAt: '2026-10-05T18:00:00Z' },
      ],
    });
    renderRoster({ rows: [entry(), peter()] });
    enterPaymentMode();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Record payment for Mina Guirguis' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record payment for Peter Sedra' }));
    fireEvent.change(screen.getByLabelText("Each kid's amount ($)"), { target: { value: '85' } });
    fireEvent.change(screen.getByLabelText("Each kid's method"), { target: { value: 'cash' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record for 2' }));
    });

    expect(recordPaymentsMock).toHaveBeenCalledTimes(1);
    expect(recordPaymentsMock).toHaveBeenCalledWith(['reg-1', 'reg-2'], { amount: '85', method: 'cash' });
    expect(toast).toHaveBeenCalledWith({ title: '$85 recorded for 2 kids' });
    // Both are paid now, so the chase ends rather than leaving an empty roster.
    expect(screen.getByRole('button', { name: 'Guirguis, Mina' })).toBeInTheDocument();
  });

  it('shows the action\'s field errors under the bulk fields and keeps the selection', async () => {
    recordPaymentsMock.mockResolvedValue({
      ok: false,
      error: 'Check the payment details.',
      fieldErrors: { amount: 'The amount must be more than $0' },
    });
    renderRoster();
    enterPaymentMode();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Record payment for Mina Guirguis' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record for 1' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('The amount must be more than $0');
    expect(screen.getByRole('checkbox', { name: 'Record payment for Mina Guirguis' })).toBeChecked();
    expect(toast).not.toHaveBeenCalled();
  });

  it('drops the selection when switching to the consent chase', () => {
    renderRoster();
    enterPaymentMode();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record payment for Mina Guirguis' }));

    fireEvent.click(screen.getByRole('button', { name: /still owe a consent form/i }));

    expect(screen.getByRole('checkbox', { name: 'Consent form received for Mina Guirguis' })).not.toBeChecked();
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });
});

describe('payments -- the per-kid Payments block', () => {
  const open = (name = 'Guirguis, Mina') => fireEvent.click(screen.getByRole('button', { name }));

  it('lists recorded payments with their total', () => {
    renderRoster({ rows: [paid()] });
    open('Abdo, Marina');

    expect(screen.getByText('$40 recorded')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Payments for Marina Abdo' });
    expect(within(list).getByText('Venmo')).toBeInTheDocument();
    expect(within(list).getByText('$40')).toBeInTheDocument();
  });

  it('records a payment for just this kid', async () => {
    recordPaymentsMock.mockResolvedValue({
      ok: true,
      payments: [{ id: 'p-new', registrationId: 'reg-1', amountCents: 4250, method: 'paypal', receivedAt: '2026-10-05T18:00:00Z' }],
    });
    renderRoster();
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '42.50' } });
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'paypal' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    });

    expect(recordPaymentsMock).toHaveBeenCalledWith(['reg-1'], { amount: '42.50', method: 'paypal' });
    expect(screen.getByText('$42.50 recorded')).toBeInTheDocument();
  });

  it('removes a payment after confirming', async () => {
    deletePaymentMock.mockResolvedValue({ ok: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderRoster({ rows: [paid()] });
    open('Abdo, Marina');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove $40 Venmo payment for Marina Abdo' }));
    });

    expect(deletePaymentMock).toHaveBeenCalledWith('pay-1');
    expect(screen.getByText('None recorded')).toBeInTheDocument();
  });

  it('is not shown to staff who are not Admin', () => {
    renderRoster({ isAdmin: false });
    open();

    expect(screen.queryByText('Payments')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
  });
});
