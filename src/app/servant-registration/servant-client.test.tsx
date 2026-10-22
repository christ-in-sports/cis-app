/**
 * Covers the servant form's behaviour: the session and team questions appear
 * only when serving, prefill (and that last season's missed dates are not
 * carried over), and that a bad form never reaches the Server Action.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ServantClient from './servant-client';
import type { ServantRegistrationRecord } from '@/lib/registration/servant-form';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const submitServantRegistration = jest.fn();
jest.mock('./actions', () => ({
  submitServantRegistration: (input: unknown) => submitServantRegistration(input),
}));

const season = { id: 'season-1', name: 'CIS 2026-2027', starts_on: '2027-01-10' };

function record(over: Partial<ServantRegistrationRecord> = {}): ServantRegistrationRecord {
  return {
    full_name: 'Mina Hanna',
    evaluation_status: 'completed',
    is_serving: true,
    sessions: ['juniors'],
    juniors_subteams: ['coaches'],
    ambassadors_subteams: [],
    juniors_other: null,
    ambassadors_other: null,
    notes: null,
    dates_missing: 'Feb 7',
    phone: '(510) 555-1234',
    emergency_contact_name: 'Sara Hanna',
    emergency_contact_phone: '(510) 555-9876',
    gender: 'male',
    dob: '1990-04-02',
    home_address: '1 Main St, Hayward CA',
    updated_at: '2026-10-01T18:30:00Z',
    ...over,
  };
}

function renderForm(props: Partial<React.ComponentProps<typeof ServantClient>> = {}) {
  return render(
    <ServantClient
      season={season}
      email="mina@test.local"
      hasRole={false}
      registration={null}
      prefilled={false}
      {...props}
    />,
  );
}

beforeEach(() => {
  submitServantRegistration.mockReset();
  window.scrollTo = jest.fn();
});

describe('servant registration form', () => {
  it('hides the session and team questions until the servant says they are serving', () => {
    renderForm();
    expect(screen.queryByText('Which sessions can you serve?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Yes'));
    expect(screen.getByText('Which sessions can you serve?')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('No'));
    expect(screen.queryByText('Which sessions can you serve?')).not.toBeInTheDocument();
  });

  it('asks for teams only for the sessions that were ticked', () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Yes'));
    expect(screen.queryByText(/Juniors: which teams/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Juniors/ }));
    expect(screen.getByText(/Juniors: which teams/)).toBeInTheDocument();
    expect(screen.queryByText(/Ambassadors: which teams/)).not.toBeInTheDocument();
  });

  it('shows the login email read-only', () => {
    renderForm();
    const email = screen.getByLabelText('Email');
    expect(email).toHaveValue('mina@test.local');
    expect(email).toHaveAttribute('readonly');
  });

  it('prefills from this season\'s registration and shows when it was last saved', () => {
    renderForm({ registration: record() });
    expect(screen.getByLabelText('Name')).toHaveValue('Mina Hanna');
    expect(screen.getByLabelText('Yes')).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Juniors/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Coaches/ })).toBeChecked();
    expect(screen.getByLabelText(/Dates you will miss/)).toHaveValue('Feb 7');
    expect(screen.getByText(/Last saved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('prefills from last season but leaves the missed dates empty and nothing "saved"', () => {
    renderForm({ registration: record(), prefilled: true });
    expect(screen.getByLabelText('Name')).toHaveValue('Mina Hanna');
    expect(screen.getByLabelText(/Dates you will miss/)).toHaveValue('');
    expect(screen.queryByText(/Last saved/)).not.toBeInTheDocument();
    expect(screen.getByText(/from your last registration/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
  });

  it('does not call the action for an invalid form, and says what is wrong', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('Say whether you are serving this season')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(submitServantRegistration).not.toHaveBeenCalled();
  });

  it('asks for a team or Other for each chosen session', async () => {
    renderForm({ registration: record({ juniors_subteams: [] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Choose at least one team for Juniors/)).toBeInTheDocument();
    expect(submitServantRegistration).not.toHaveBeenCalled();
  });

  it('replaces the form with a confirmation after the first submit', async () => {
    submitServantRegistration.mockResolvedValue({ ok: true, isNew: true, emailFailed: false });
    renderForm({ registration: record() });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(submitServantRegistration).toHaveBeenCalledTimes(1));
    expect(submitServantRegistration.mock.calls[0][0]).toMatchObject({
      full_name: 'Mina Hanna',
      is_serving: true,
      sessions: ['juniors'],
      phone: '(510) 555-1234',
    });

    expect(await screen.findByText('You are registered')).toBeInTheDocument();
    expect(screen.getByText(/Thank you, Mina/)).toBeInTheDocument();
    expect(screen.getByText('Coaches')).toBeInTheDocument();
    expect(screen.getByText(/on its way to mina@test.local/)).toBeInTheDocument();
    // A servant with no role is told what happens next.
    expect(screen.getByText(/An Admin will assign your role/)).toBeInTheDocument();
    // The form, and what must not be repeated, is gone.
    expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument();
    expect(screen.queryByText('1 Main St, Hayward CA')).not.toBeInTheDocument();
  });

  it('says so on the confirmation when the email could not be sent', async () => {
    submitServantRegistration.mockResolvedValue({ ok: true, isNew: true, emailFailed: true });
    renderForm({ registration: record() });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/could not send your confirmation email/)).toBeInTheDocument();
    expect(screen.queryByText(/on its way to/)).not.toBeInTheDocument();
  });

  it('returns to the form, with the answers, from "Edit my answers"', async () => {
    submitServantRegistration.mockResolvedValue({ ok: true, isNew: true, emailFailed: false });
    renderForm({ registration: record() });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit my answers' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Mina Hanna');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('keeps the form on screen for an edit on a fresh visit and confirms next to the button', async () => {
    submitServantRegistration.mockResolvedValue({ ok: true, isNew: false, emailFailed: false });
    renderForm({ registration: record() });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // One check, so the 2.5s "saved" moment cannot lapse between two assertions on a slow run.
    await waitFor(() => {
      expect(screen.getByText('Changes saved')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeInTheDocument();
    });
    expect(screen.queryByText('You are registered')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('returns to the confirmation screen when an edit was started from it', async () => {
    submitServantRegistration
      .mockResolvedValueOnce({ ok: true, isNew: true, emailFailed: false })
      .mockResolvedValueOnce({ ok: true, isNew: false, emailFailed: false });
    renderForm({ registration: record() });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit my answers' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mina H.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { name: 'Changes saved' })).toBeInTheDocument();
    expect(screen.getByText(/is up to date/)).toBeInTheDocument();
    // No email went out for an edit, so none is mentioned.
    expect(screen.queryByText(/confirmation email/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('flags unsaved changes, and clears the flag once they are saved', async () => {
    submitServantRegistration.mockResolvedValue({ ok: true, isNew: false, emailFailed: false });
    renderForm({ registration: record() });
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mina H.' } });
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Changes saved');
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
  });

  it('asks the browser to confirm before leaving with unsaved changes', () => {
    renderForm({ registration: record() });
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mina H.' } });
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('shows the server\'s message when saving fails', async () => {
    submitServantRegistration.mockResolvedValue({ ok: false, error: 'Registration is not open right now.' });
    renderForm({ registration: record() });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Registration is not open right now.')).toBeInTheDocument();
    expect(screen.queryByText('You are registered')).not.toBeInTheDocument();
  });

  it('links back home only for a user who has a role', () => {
    const { unmount } = renderForm({ hasRole: false });
    expect(screen.queryByText('Back to home')).not.toBeInTheDocument();
    unmount();
    renderForm({ hasRole: true });
    expect(screen.getByText('Back to home')).toBeInTheDocument();
  });
});
