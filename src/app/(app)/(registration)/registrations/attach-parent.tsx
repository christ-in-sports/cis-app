'use client';

/**
 * The Admin's "Attach to parent" control on an expanded roster row (ENG-30).
 *
 * A kid imported from the Google Form backup has no parent account, so no one
 * but an Admin can see them. This is how an Admin hands such a kid to the
 * parent who has since joined. It is two steps on purpose: the parent's name is
 * read back before anything is written, because the person it is attached to
 * can then see the kid's address, emergency contact, photo and payments.
 *
 * Like `PaymentsPanel`, it only collects input and hands it up: the page calls
 * the Server Actions and reconciles the roster.
 */

import { useRef, useState } from 'react';

import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { Field, FieldError, TextInput } from '@/components/cis/form';
import type { AttachKidResult, FindParentResult, ParentMatch } from './actions';

type Step =
  | { name: 'closed' }
  | { name: 'asking'; error?: string }
  | { name: 'confirming'; parent: ParentMatch; error?: string };

export function AttachParent({
  kidName,
  hasParent,
  suggestedEmail,
  onFind,
  onAttach,
}: {
  kidName: string;
  hasParent: boolean;
  /** The guardian email from the form: the likeliest login, only ever a suggestion. */
  suggestedEmail: string;
  onFind: (email: string) => Promise<FindParentResult>;
  onAttach: (email: string) => Promise<AttachKidResult>;
}) {
  const [step, setStep] = useState<Step>({ name: 'closed' });
  const [email, setEmail] = useState(suggestedEmail);
  const [busy, setBusy] = useState(false);
  // `busy` is state, so two taps in one tick could both see it false.
  const inFlight = useRef(false);

  async function find() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await onFind(email);
      setStep(
        result.ok && result.parent
          ? { name: 'confirming', parent: result.parent }
          : { name: 'asking', error: result.error ?? 'Could not look that email up.' },
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function attach() {
    if (inFlight.current || step.name !== 'confirming') return;
    const { parent } = step;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await onAttach(parent.email);
      // On success the roster re-renders this row as attached and drops this control.
      if (!result.ok) setStep({ name: 'confirming', parent, error: result.error ?? 'Could not attach the kid.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mb-cis-3 flex flex-col gap-cis-2 text-cis-sm">
      <div className="flex flex-wrap items-center gap-cis-2">
        <span className="font-semibold text-cis-ink-muted">Parent account</span>
        <span className="font-bold">{hasParent ? 'Attached' : 'Not attached'}</span>
        {!hasParent && step.name === 'closed' && (
          <button
            type="button"
            onClick={() => setStep({ name: 'asking' })}
            className="rounded-cis-chip border-2 border-cis-ink px-3 py-[5px] text-cis-sm font-bold hover:bg-[rgba(36,31,28,.07)]"
          >
            Attach to parent
          </button>
        )}
      </div>

      {!hasParent && step.name === 'asking' && (
        <form
          className="flex flex-col gap-cis-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <Field
            label="Parent's email"
            hint="The email they joined with. It can differ from the guardian email on the form."
            error={step.error}
          >
            {(props) => (
              <TextInput
                {...props}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={busy}
              />
            )}
          </Field>
          <div className="flex gap-cis-2">
            <PrimaryButton type="submit" className="min-h-cis-tap-min flex-1 px-4 text-cis-base" disabled={busy}>
              {busy ? 'Looking…' : 'Find parent'}
            </PrimaryButton>
            <SecondaryButton
              type="button"
              className="min-h-cis-tap-min px-4 text-cis-base"
              disabled={busy}
              onClick={() => setStep({ name: 'closed' })}
            >
              Cancel
            </SecondaryButton>
          </div>
        </form>
      )}

      {!hasParent && step.name === 'confirming' && (
        <div className="flex flex-col gap-cis-3">
          <p className="m-0 text-cis-base leading-[1.5]">
            Attach <strong>{kidName}</strong> to <strong>{step.parent.name}</strong> ({step.parent.email})? They will
            be able to see {kidName}&apos;s address, emergency contact, photo and payments.
          </p>
          {step.error && <FieldError>{step.error}</FieldError>}
          <div className="flex gap-cis-2">
            <PrimaryButton
              type="button"
              className="min-h-cis-tap-min flex-1 px-4 text-cis-base"
              disabled={busy}
              onClick={() => void attach()}
            >
              {busy ? 'Attaching…' : 'Attach'}
            </PrimaryButton>
            <SecondaryButton
              type="button"
              className="min-h-cis-tap-min px-4 text-cis-base"
              disabled={busy}
              onClick={() => setStep({ name: 'asking' })}
            >
              Back
            </SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
