/**
 * The join form: it asks for a name before it asks for a code, sends the name and
 * the link's code with the email, and the signed-in version adds Parent in one tap.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import JoinClient, { JoinSignedIn } from './join-client';
import { joinAsSignedInUser, sendJoinCode, verifyJoinCode } from './actions';

jest.mock('./actions', () => ({
  sendJoinCode: jest.fn(),
  verifyJoinCode: jest.fn(),
  joinAsSignedInUser: jest.fn(),
}));

const sendMock = sendJoinCode as jest.MockedFunction<typeof sendJoinCode>;
const verifyMock = verifyJoinCode as jest.MockedFunction<typeof verifyJoinCode>;
const signedInMock = joinAsSignedInUser as jest.MockedFunction<typeof joinAsSignedInUser>;

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ ok: true });
  verifyMock.mockReset().mockResolvedValue({ ok: false, error: 'That code did not work.' });
  signedInMock.mockReset().mockResolvedValue({ ok: false, error: 'You are signed out.' });
});

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('JoinClient', () => {
  it('asks for a name before it asks for a code', async () => {
    render(<JoinClient code="link-code" />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mariam@example.com' } });
    await click('Email me a code');

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends the name, the email and the link code, then asks for the emailed code', async () => {
    render(<JoinClient code="link-code" />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mariam Guirguis' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mariam@example.com' } });
    await click('Email me a code');

    expect(sendMock).toHaveBeenCalledWith({
      code: 'link-code',
      name: 'Mariam Guirguis',
      email: 'mariam@example.com',
    });
    expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
  });

  it('checks the emailed code against the same link code', async () => {
    render(<JoinClient code="link-code" />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mariam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mariam@example.com' } });
    await click('Email me a code');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    });

    expect(verifyMock).toHaveBeenCalledWith({
      code: 'link-code',
      email: 'mariam@example.com',
      token: '123456',
    });
    expect(screen.getByText('That code did not work.')).toBeInTheDocument();
  });
});

describe('JoinSignedIn', () => {
  it('names the account and adds Parent when the button is pressed', async () => {
    render(<JoinSignedIn code="link-code" email="carol@example.com" />);

    expect(screen.getByText('carol@example.com')).toBeInTheDocument();
    await click('Join as a parent');

    expect(signedInMock).toHaveBeenCalledWith({ code: 'link-code' });
    expect(screen.getByRole('alert')).toHaveTextContent('You are signed out.');
  });
});
