/**
 * The email-code form: the two steps, that a wrong or short code is refused with
 * a reason, that the sixth digit signs in by itself, and that "send a new code"
 * waits out the cooldown.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { EmailCodeForm, RESEND_SECONDS, type CodeResult } from './email-code-form';

const sendCode = jest.fn<Promise<CodeResult>, [string]>();
const verifyCode = jest.fn<Promise<CodeResult>, [string, string]>();
const onVerified = jest.fn();

function renderForm() {
  return render(<EmailCodeForm sendCode={sendCode} verifyCode={verifyCode} onVerified={onVerified} />);
}

async function askForCode(email = 'Maria@Example.com ') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  });
}

const codeBox = () => screen.getByLabelText('6-digit code');

beforeEach(() => {
  sendCode.mockReset().mockResolvedValue({ ok: true });
  verifyCode.mockReset().mockResolvedValue({ ok: true });
  onVerified.mockReset();
});

describe('asking for a code', () => {
  it('sends to the address trimmed and lower-cased, then asks for the code', async () => {
    renderForm();
    await askForCode();

    expect(sendCode).toHaveBeenCalledWith('maria@example.com');
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(codeBox()).toBeInTheDocument();
  });

  it('refuses an address that is not an email, without sending anything', async () => {
    renderForm();
    await askForCode('maria');

    expect(sendCode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });

  it('stays on the email step and says why when sending fails', async () => {
    sendCode.mockResolvedValue({ ok: false, error: 'Too many requests. Please wait a minute and try again.' });
    renderForm();
    await askForCode();

    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });

  it('lets a mistyped address be changed', async () => {
    renderForm();
    await askForCode();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));

    expect(screen.getByLabelText('Email')).toHaveValue('maria@example.com');
  });
});

describe('entering the code', () => {
  it('asks the phone for the number pad and the emailed code', async () => {
    renderForm();
    await askForCode();

    expect(codeBox()).toHaveAttribute('inputmode', 'numeric');
    expect(codeBox()).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('signs in by itself on the sixth digit, keeping only digits', async () => {
    renderForm();
    await askForCode();
    await act(async () => {
      fireEvent.change(codeBox(), { target: { value: '12 34-56' } });
    });

    expect(verifyCode).toHaveBeenCalledWith('maria@example.com', '123456');
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  it('does not check a short code', async () => {
    renderForm();
    await askForCode();
    fireEvent.change(codeBox(), { target: { value: '123' } });

    expect(verifyCode).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('clears a wrong code and says so, without signing in', async () => {
    verifyCode.mockResolvedValue({ ok: false, error: 'That code did not work.' });
    renderForm();
    await askForCode();
    await act(async () => {
      fireEvent.change(codeBox(), { target: { value: '000000' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('That code did not work.');
    expect(codeBox()).toHaveValue('');
    expect(codeBox()).toHaveFocus();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('checks the code once even if it is entered twice in a row', async () => {
    let finish: (r: CodeResult) => void = () => {};
    verifyCode.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    await askForCode();
    await act(async () => {
      fireEvent.change(codeBox(), { target: { value: '123456' } });
      fireEvent.submit(codeBox().closest('form')!);
    });
    await act(async () => finish({ ok: true }));

    expect(verifyCode).toHaveBeenCalledTimes(1);
  });
});

describe('sending a new code', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits out the cooldown, then sends again', async () => {
    renderForm();
    await askForCode();

    const resend = () => screen.getByRole('button', { name: /Send a new code/ });
    expect(resend()).toBeDisabled();
    expect(resend()).toHaveTextContent(`in ${RESEND_SECONDS}s`);

    await act(async () => {
      jest.advanceTimersByTime(RESEND_SECONDS * 1000);
    });
    expect(resend()).toBeEnabled();

    await act(async () => {
      fireEvent.click(resend());
    });
    expect(sendCode).toHaveBeenCalledTimes(2);
    expect(resend()).toBeDisabled();
  });
});
