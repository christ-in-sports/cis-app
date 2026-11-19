'use client';

import { useState } from 'react';

import { PrimaryButton } from '@/components/cis/button';
import { EmailCodeForm } from '@/components/cis/email-code-form';
import { Field, FieldError, TextInput } from '@/components/cis/form';
import { parentFirstNameSchema, parentLastNameSchema } from '@/lib/validation/join';
import { joinAsSignedInUser, sendJoinCode, verifyJoinCode } from './actions';

const REGISTER_PATH = '/register';

/** A new or returning parent: first and last name and email, then the emailed code. */
export default function JoinClient({ code }: { code: string }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstError, setFirstError] = useState<string | undefined>();
  const [lastError, setLastError] = useState<string | undefined>();

  return (
    <EmailCodeForm
      extraFields={
        // Labelled "Parent" so nobody types their kid's name here: the kid comes next, on the registration form.
        <div className="flex gap-cis-3">
          <div className="min-w-0 flex-1">
            <Field label="Parent first name" error={firstError}>
              {(props) => (
                <TextInput
                  {...props}
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <Field label="Parent last name" error={lastError}>
              {(props) => (
                <TextInput
                  {...props}
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              )}
            </Field>
          </div>
        </div>
      }
      validateExtra={() => {
        const first = parentFirstNameSchema.safeParse(firstName);
        const last = parentLastNameSchema.safeParse(lastName);
        setFirstError(first.success ? undefined : first.error.issues[0]?.message);
        setLastError(last.success ? undefined : last.error.issues[0]?.message);
        return first.success && last.success;
      }}
      sendCode={(email) => sendJoinCode({ code, firstName, lastName, email })}
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
