/**
 * Covers the parent registration flow's behaviour: what the picker says about
 * each kid, which fields are locked for a returning kid, how grade drives
 * division, and that a bad form never reaches the server action.
 *
 * Registration validation is on AGENTS.md §7's must-test list. The schema has
 * its own tests; these check that the screen actually applies it.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import RegisterClient from './register-client';
import type { ParentKid } from '@/lib/registration/parent';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: jest.fn() }),
}));

const registerKid = jest.fn();
jest.mock('./actions', () => ({
  registerKid: (input: unknown) => registerKid(input),
}));

const season = { id: 'season-1', name: 'CIS 2026-2027' };

function kid(overrides: Partial<ParentKid> = {}): ParentKid {
  return {
    id: '6f1c3a52-7a4b-4d55-9f44-0a6f3e1c2b10',
    first_name: 'Mina',
    last_name: 'Guirguis',
    dob: '2014-03-02',
    gender: 'male',
    email: null,
    phone: null,
    allergies: null,
    home_address: '1 Church Way, Hayward, CA',
    emergency_contact_name: 'Mariam Guirguis',
    emergency_contact_phone: '(510) 555-0111',
    guardian_name: 'Mariam Guirguis',
    guardian_phone: '(510) 555-0111',
    guardian_email: 'mariam@example.com',
    registration: {
      id: 'reg-1',
      grade: 6,
      division: 'juniors',
      tshirt_size: 'YM',
      top_sports: null,
      on_team: false,
      consent_given_at: '2026-09-28T12:00:00Z',
    },
    ...overrides,
  };
}

const withReg = (patch: Partial<NonNullable<ParentKid['registration']>>) =>
  kid({ registration: { ...kid().registration!, ...patch } });

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the kid picker', () => {
  it('goes straight to a blank form when the parent has no kids yet', () => {
    render(<RegisterClient season={season} kids={[]} />);

    expect(screen.getByRole('heading', { name: 'About your kid' })).toBeInTheDocument();
    expect(field('Home address').value).toBe('');
    expect(screen.queryByText('Who are you registering?')).not.toBeInTheDocument();
  });

  it('says when a registration is waiting on the waiver, and when it is done', () => {
    render(
      <RegisterClient
        season={season}
        kids={[
          withReg({ consent_given_at: null }),
          kid({ id: 'k2', first_name: 'Marina' }),
          kid({ id: 'k3', first_name: 'Peter', registration: null }),
        ]}
      />,
    );

    const mina = screen.getByText('Mina Guirguis').closest('button')!;
    expect(within(mina).getByText('Grade 6 · Waiver needed')).toBeInTheDocument();
    expect(within(mina).getByText('Finish')).toBeInTheDocument();

    const marina = screen.getByText('Marina Guirguis').closest('button')!;
    expect(within(marina).getByText('Grade 6 · Registered')).toBeInTheDocument();
    expect(within(marina).getByText('Review')).toBeInTheDocument();

    const peter = screen.getByText('Peter Guirguis').closest('button')!;
    expect(within(peter).getByText('Not registered this season')).toBeInTheDocument();
    expect(within(peter).getByText('Register')).toBeInTheDocument();
  });

  it('carries household details to a new kid, but nothing about the child', () => {
    render(<RegisterClient season={season} kids={[kid()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add another kid' }));

    expect(field('First name').value).toBe('');
    expect(field('Last name').value).toBe('');
    expect(field('Date of birth').value).toBe('');
    expect(field('Home address').value).toBe('1 Church Way, Hayward, CA');
    expect(screen.getAllByLabelText('Name')[0]).toHaveValue('Mariam Guirguis');
    expect(field('Email')).toHaveValue('mariam@example.com');
  });
});

describe('a returning kid', () => {
  it('shows name, birthday and gender as text, not as fields', () => {
    render(<RegisterClient season={season} kids={[kid()]} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    expect(screen.getByText('March 2, 2014')).toBeInTheDocument();
    expect(screen.getByText('Male')).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument();
    expect(screen.getByText(/ask an Admin/i)).toBeInTheDocument();
    // What they may still change is editable and pre-filled.
    expect(field('Home address').value).toBe('1 Church Way, Hayward, CA');
  });

  it('leaves the waiver unticked, because consent is given again on every save', () => {
    render(<RegisterClient season={season} kids={[kid()]} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('sends the returning branch with the kid id, and no locked fields', async () => {
    registerKid.mockResolvedValue({ ok: true });
    render(<RegisterClient season={season} kids={[kid()]} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(registerKid).toHaveBeenCalledTimes(1));
    const sent = registerKid.mock.calls[0][0];
    expect(sent.mode).toBe('returning');
    expect(sent.kid_id).toBe(kid().id);
    for (const locked of ['first_name', 'last_name', 'dob', 'gender']) {
      expect(sent.kid).not.toHaveProperty(locked);
    }
    expect(await screen.findByText('Registration saved')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  // The database refuses this too; the screen just should not offer the form.
  it('offers no form once the kid is on a team', () => {
    render(<RegisterClient season={season} kids={[withReg({ on_team: true })]} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    expect(screen.getByText('Mina Guirguis is on a team')).toBeInTheDocument();
    expect(screen.getByText(/Contact an Admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes|Register/ })).not.toBeInTheDocument();
  });
});

describe('grade and division', () => {
  const division = (name: 'juniors' | 'ambassadors') =>
    document.querySelector(`input[name=division][value=${name}]`) as HTMLInputElement;

  it('sets the division from the grade and locks it', () => {
    render(<RegisterClient season={season} kids={[]} />);

    fireEvent.change(field('Grade'), { target: { value: '5' } });
    expect(division('juniors')).toBeChecked();
    expect(division('juniors')).toBeDisabled();
    expect(division('ambassadors')).toBeDisabled();

    fireEvent.change(field('Grade'), { target: { value: '9' } });
    expect(division('ambassadors')).toBeChecked();
    expect(division('ambassadors')).toBeDisabled();
  });

  it('lets grade 7 choose either', () => {
    render(<RegisterClient season={season} kids={[]} />);

    fireEvent.change(field('Grade'), { target: { value: '7' } });
    expect(division('juniors')).toBeEnabled();
    expect(division('ambassadors')).toBeEnabled();

    fireEvent.click(division('ambassadors'));
    expect(division('ambassadors')).toBeChecked();
  });

  it('does not allow a division before a grade is chosen', () => {
    render(<RegisterClient season={season} kids={[]} />);

    expect(division('juniors')).toBeDisabled();
    expect(screen.getByText('Choose a grade first.')).toBeInTheDocument();
  });
});

describe('submitting a new kid', () => {
  function fillValid() {
    fireEvent.change(field('First name'), { target: { value: 'Marina' } });
    fireEvent.change(field('Last name'), { target: { value: 'Guirguis' } });
    fireEvent.change(field('Date of birth'), { target: { value: '2012-05-20' } });
    fireEvent.click(screen.getByLabelText('Female'));
    fireEvent.change(field('Home address'), { target: { value: '1 Church Way' } });
    fireEvent.change(field('Grade'), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText('M'));
    const names = screen.getAllByLabelText('Name');
    const phones = screen.getAllByLabelText('Phone');
    fireEvent.change(names[0], { target: { value: 'Mariam Guirguis' } });
    fireEvent.change(phones[0], { target: { value: '555-0111' } });
    fireEvent.change(field('Email'), { target: { value: 'mariam@example.com' } });
    fireEvent.change(names[1], { target: { value: 'Peter Guirguis' } });
    fireEvent.change(phones[1], { target: { value: '555-0122' } });
  }

  it('shows every problem, focuses the first, and never calls the server', () => {
    render(<RegisterClient season={season} kids={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(registerKid).not.toHaveBeenCalled();
    // "Choose a grade" is also the select's placeholder option, so read the
    // messages from the alerts rather than by text.
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        'First name is required',
        'Last name is required',
        'Choose a grade',
        'Choose a T-shirt size',
        'You must agree to the liability waiver',
        'Please fix the fields marked above.',
      ]),
    );

    return waitFor(() => expect(field('First name')).toHaveFocus());
  });

  it('will not submit without the waiver', () => {
    render(<RegisterClient season={season} kids={[]} />);
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(registerKid).not.toHaveBeenCalled();
    expect(screen.getByText('You must agree to the liability waiver')).toBeInTheDocument();
  });

  it('sends a valid registration and shows the done screen', async () => {
    registerKid.mockResolvedValue({ ok: true, kidId: 'k', registrationId: 'r' });
    render(<RegisterClient season={season} kids={[]} />);
    fillValid();
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(registerKid).toHaveBeenCalledTimes(1));
    const sent = registerKid.mock.calls[0][0];
    expect(sent.mode).toBe('new');
    expect(sent.consent).toBe(true);
    expect(sent.kid).toMatchObject({ first_name: 'Marina', gender: 'female', dob: '2012-05-20' });
    expect(sent.registration).toMatchObject({ grade: 6, division: 'juniors', tshirt_size: 'M' });

    expect(await screen.findByText('Registered')).toBeInTheDocument();
    expect(screen.getByText('Marina Guirguis')).toBeInTheDocument();
  });

  it('shows the server\'s per-field errors and stays on the form', async () => {
    registerKid.mockResolvedValue({
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: { 'kid.guardian_email': ['Parent/guardian email is not a valid email address'] },
    });
    render(<RegisterClient season={season} kids={[]} />);
    fillValid();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('Parent/guardian email is not a valid email address'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Registered')).not.toBeInTheDocument();
  });

  it('shows a whole-form error, such as a duplicate kid, without field errors', async () => {
    registerKid.mockResolvedValue({
      ok: false,
      error: 'You have already added a kid with that name and date of birth.',
    });
    render(<RegisterClient season={season} kids={[]} />);
    fillValid();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(/already added a kid/)).toBeInTheDocument();
    expect(screen.queryByText('Registered')).not.toBeInTheDocument();
  });
});
