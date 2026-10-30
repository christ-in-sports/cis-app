'use client';

/**
 * `EmailCodeForm` -- sign in with a 6-digit code sent by email (ENG-28).
 *
 * Two steps in one place: type your email, then type the code that arrives. The
 * form does not talk to Supabase itself. The page passes `sendCode` and
 * `verifyCode`, so `/login` (existing accounts only) and the parent join link
 * (which may create the account, ENG-31) share the screen and differ in what
 * they send. Both return `{ ok, error }`; `error` is the sentence shown.
 *
 * Built for a parent on a phone who has never seen it before:
 *  - the code box asks for the number pad and `one-time-code`, so iOS offers the
 *    code from the email above the keyboard;
 *  - it signs in by itself on the sixth digit, and also has a Sign in button;
 *  - a wrong code clears the box and says so, rather than leaving digits to
 *    delete;
 *  - "Send a new code" waits 60 seconds, the shortest gap hosted Supabase
 *    allows, instead of letting a tap fail with a rate-limit error;
 *  - a mistyped email is one tap back.
 *
 * `extraFields` and `validateExtra` let a page add fields to the first step (the
 * join link's name) without the form knowing what they are.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { Field, TextInput } from '@/components/cis/form';
import { EMAIL_CODE_LENGTH, emailCodeSchema, emailSchema } from '@/lib/validation/email-code';

export interface CodeResult {
  ok: boolean;
  /** What to tell the person when `ok` is false. */
  error?: string;
}

/** Seconds before a new code can be asked for. Hosted Supabase allows one per 60. */
export const RESEND_SECONDS = 60;

export function EmailCodeForm({
  sendCode,
  verifyCode,
  onVerified,
  extraFields,
  validateExtra,
}: {
  /** Emails a code to this address (already trimmed and lower-cased). */
  sendCode: (email: string) => Promise<CodeResult>;
  /** Checks the code for this address and signs the person in. */
  verifyCode: (email: string, code: string) => Promise<CodeResult>;
  /** Called once the code is accepted. */
  onVerified: () => void;
  /**
   * More fields for the first step, shown above the email: the parent join link
   * asks for a name. The page owns their state and their error messages.
   */
  extraFields?: ReactNode;
  /**
   * Called before a code is requested. Return false to stop (after showing the
   * problem beside the field it belongs to), so a missing name is not reported
   * under the email box.
   */
  validateExtra?: () => boolean;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // `busy` is state, so two quick calls in one tick could both see it false.
  const inFlight = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);

  const counting = cooldown > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  async function guarded(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function requestCode(): Promise<boolean> {
    if (validateExtra && !validateExtra()) return false;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return false;
    }
    setEmail(parsed.data);
    const result = await sendCode(parsed.data);
    if (!result.ok) {
      setError(result.error ?? 'We could not send a code. Please try again.');
      return false;
    }
    setError(undefined);
    setCooldown(RESEND_SECONDS);
    return true;
  }

  function submitEmail(e: FormEvent) {
    e.preventDefault();
    void guarded(async () => {
      if (await requestCode()) {
        setCode('');
        setStep('code');
      }
    });
  }

  function resend() {
    void guarded(async () => {
      if (await requestCode()) setCode('');
    });
  }

  function checkCode(value: string) {
    void guarded(async () => {
      const parsed = emailCodeSchema.safeParse(value);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message);
        return;
      }
      const result = await verifyCode(email, parsed.data);
      if (!result.ok) {
        setError(result.error ?? 'That code did not work. Check it and try again.');
        setCode('');
        codeInput.current?.focus();
        return;
      }
      setError(undefined);
      onVerified();
    });
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
    setCode(digits);
    if (digits.length === EMAIL_CODE_LENGTH) checkCode(digits);
  }

  if (step === 'email') {
    return (
      <form onSubmit={submitEmail} noValidate className="flex flex-col gap-cis-4">
        {extraFields}
        <Field label="Email" error={error}>
          {(props) => (
            <TextInput
              {...props}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={busy}
            />
          )}
        </Field>
        <PrimaryButton type="submit" block disabled={busy}>
          {busy ? 'Sending…' : 'Email me a code'}
        </PrimaryButton>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        checkCode(code);
      }}
      noValidate
      className="flex flex-col gap-cis-4"
    >
      <p className="m-0 text-cis-base leading-[1.5] text-cis-ink">
        We sent a {EMAIL_CODE_LENGTH}-digit code to <strong className="break-words">{email}</strong>. It can take a
        minute to arrive.
      </p>
      <Field label={`${EMAIL_CODE_LENGTH}-digit code`} error={error}>
        {(props) => (
          <TextInput
            {...props}
            ref={codeInput}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={EMAIL_CODE_LENGTH}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            // Not disabled: a disabled box drops focus, so a wrong code could not
            // put the cursor back for the next try.
            readOnly={busy}
            className="text-center text-cis-xl font-extrabold tracking-[0.3em]"
          />
        )}
      </Field>
      <PrimaryButton type="submit" block disabled={busy || code.length !== EMAIL_CODE_LENGTH}>
        {busy ? 'Checking…' : 'Sign in'}
      </PrimaryButton>
      <SecondaryButton type="button" block disabled={busy || cooldown > 0} onClick={resend}>
        {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
      </SecondaryButton>
      <SecondaryButton
        type="button"
        block
        disabled={busy}
        onClick={() => {
          setError(undefined);
          setCode('');
          setStep('email');
        }}
      >
        Use a different email
      </SecondaryButton>
    </form>
  );
}
