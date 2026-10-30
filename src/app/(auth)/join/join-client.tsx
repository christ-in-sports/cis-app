'use client';

import { useState } from 'react';

import { PrimaryButton } from '@/components/cis/button';
import { EmailCodeForm } from '@/components/cis/email-code-form';
import { Field, FieldError, TextInput } from '@/components/cis/form';
import { parentNameSchema } from '@/lib/validation/join';
import { joinAsSignedInUser, sendJoinCode, verifyJoinCode } from './actions';

const REGISTER_PATH = '/register';

/** A new or returning parent: name and email, then the emailed code. */
export default function JoinClient({ code }: { code: string }) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();

  return (
    <EmailCodeForm
      extraFields={
        <Field label="Your name" error={nameError}>
          {(props) => (
            <TextInput
              {...props}
              type="text"
              autoComplete="name"
              placeholder="First and last name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
      }
      validateExtra={() => {
        const result = parentNameSchema.safeParse(name);
        setNameError(result.success ? undefined : result.error.issues[0]?.message);
        return result.success;
      }}
      sendCode={(email) => sendJoinCode({ code, name, email })}
      verifyCode={(email, token) => verifyJoinCode({ code, email, token })}
      onVerified={() => {
        // A full load, so the new session cookie is what the next page sees.
        window.location.href = REGISTER_PATH;
      }}
    />
  );
}

/** Someone already signed in: one tap adds Parent to their account. */
export function JoinSignedIn({ code, email }: { code: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function join() {
    setBusy(true);
    setError(undefined);
    const result = await joinAsSignedInUser({ code });
    if (result.ok) {
      window.location.href = REGISTER_PATH;
      return;
    }
    setError(result.error);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-cis-4">
      <p className="m-0 text-cis-base leading-[1.5] text-cis-ink">
        You are signed in as <strong className="break-words">{email}</strong>. Add parent access to this account to
        register your kids.
      </p>
      {error && <FieldError>{error}</FieldError>}
      <PrimaryButton type="button" block disabled={busy} onClick={join}>
        {busy ? 'Joining…' : 'Join as a parent'}
      </PrimaryButton>
    </div>
  );
}
