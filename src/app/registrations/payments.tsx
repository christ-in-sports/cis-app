'use client';

/**
 * The Admin's payment controls on the roster (ENG-9): the per-kid "Payments"
 * block in an expanded row, and the amount + method form the bulk bar uses.
 *
 * Both only *collect* an amount and a method and hand them to the parent, which
 * calls the `recordPayments` Server Action. Validation messages come back from
 * that action (it runs `recordPaymentSchema`), so the rules live in one place.
 */

import { useState } from 'react';
import { Field, SelectInput, TextInput } from '@/components/cis/form';
import { PrimaryButton } from '@/components/cis/button';
import {
  PAYMENT_METHOD_IDS,
  PAYMENT_METHOD_LABEL,
  REGISTRATION_FEE_CENTS,
  formatCents,
  type PaymentMethod,
} from '@/lib/registration/payment';
import type { RecordPaymentsResult } from './actions';

export interface PaymentEntry {
  id: string;
  amount_cents: number;
  method: PaymentMethod;
  received_at: string;
}

export type PaymentFieldErrors = NonNullable<RecordPaymentsResult['fieldErrors']>;

export interface PaymentDraft {
  amount: string;
  method: PaymentMethod | '';
}

/** Prefilled with the fee once it is known, so the common case is one tap. */
export const emptyPaymentDraft = (): PaymentDraft => ({
  amount: REGISTRATION_FEE_CENTS === null ? '' : String(REGISTRATION_FEE_CENTS / 100),
  method: '',
});

export const totalCents = (payments: PaymentEntry[]) =>
  payments.reduce((sum, p) => sum + p.amount_cents, 0);

/** "$40 recorded", or "$40 of $85" once the fee is set. */
export function paymentSummary(payments: PaymentEntry[]): string {
  if (payments.length === 0) return 'None recorded';
  const total = formatCents(totalCents(payments));
  return REGISTRATION_FEE_CENTS === null
    ? `${total} recorded`
    : `${total} of ${formatCents(REGISTRATION_FEE_CENTS)}`;
}

/**
 * The day a payment was recorded, in the program's own time zone.
 *
 * `received_at` is a UTC timestamp, so slicing its date would put anything
 * recorded after 5pm Pacific on the next day. Pinned to Los Angeles rather than
 * the viewer's zone so the server render and the browser always agree.
 */
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
}

/** Amount + method inputs. Shared by the per-kid form and the bulk bar. */
export function PaymentFields({
  draft,
  onChange,
  errors,
  idPrefix,
}: {
  draft: PaymentDraft;
  onChange: (draft: PaymentDraft) => void;
  errors?: PaymentFieldErrors;
  /** Disambiguates the accessible names when several forms are on screen. */
  idPrefix?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-cis-2">
      <Field label={idPrefix ? `${idPrefix} amount ($)` : 'Amount ($)'} error={errors?.amount}>
        {(props) => (
          <TextInput
            {...props}
            inputMode="decimal"
            autoComplete="off"
            placeholder="85"
            value={draft.amount}
            onChange={(e) => onChange({ ...draft, amount: e.target.value })}
          />
        )}
      </Field>
      <Field label={idPrefix ? `${idPrefix} method` : 'Method'} error={errors?.method}>
        {(props) => (
          <SelectInput
            {...props}
            value={draft.method}
            onChange={(e) => onChange({ ...draft, method: e.target.value as PaymentMethod | '' })}
          >
            <option value="">Choose…</option>
            {PAYMENT_METHOD_IDS.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
            ))}
          </SelectInput>
        )}
      </Field>
    </div>
  );
}

/**
 * The "Payments" block in a kid's expanded roster row: what has been recorded,
 * a way to remove a mistake, and a form to record another (partial payments are
 * allowed, so there is always room for one more).
 */
export function PaymentsPanel({
  kidName,
  payments,
  busy,
  onRecord,
  onRemove,
}: {
  kidName: string;
  payments: PaymentEntry[];
  busy: boolean;
  onRecord: (draft: PaymentDraft) => Promise<RecordPaymentsResult>;
  onRemove: (payment: PaymentEntry) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft>(emptyPaymentDraft);
  const [errors, setErrors] = useState<PaymentFieldErrors>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await onRecord(draft);
    if (result.ok) {
      setAdding(false);
      setDraft(emptyPaymentDraft());
      setErrors({});
    } else {
      setErrors(result.fieldErrors ?? {});
    }
  };

  return (
    <div className="mb-cis-3 flex flex-col gap-cis-2 text-cis-sm">
      <div className="flex flex-wrap items-center gap-cis-2">
        <span className="font-semibold text-cis-ink-muted">Payments</span>
        <span className="font-bold">{paymentSummary(payments)}</span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={busy}
            className="rounded-cis-chip border-2 border-cis-ink px-3 py-[5px] text-cis-sm font-bold hover:bg-[rgba(36,31,28,.07)] disabled:opacity-50"
          >
            Record payment
          </button>
        )}
      </div>

      {payments.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0" aria-label={`Payments for ${kidName}`}>
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-cis-2 border-b border-cis-rule py-[6px] last:border-b-0"
            >
              <span className="w-24 flex-shrink-0 font-semibold text-cis-ink-muted">
                {fmtDay(p.received_at)}
              </span>
              <span className="flex-1">{PAYMENT_METHOD_LABEL[p.method]}</span>
              <span className="font-extrabold tabular-nums">{formatCents(p.amount_cents)}</span>
              <button
                type="button"
                onClick={() => onRemove(p)}
                disabled={busy}
                aria-label={`Remove ${formatCents(p.amount_cents)} ${PAYMENT_METHOD_LABEL[p.method]} payment for ${kidName}`}
                className="rounded-cis-chip border-2 border-cis-ink px-3 py-[3px] text-cis-sm font-bold hover:bg-[rgba(36,31,28,.07)] disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form onSubmit={submit} className="flex flex-col gap-cis-2" aria-label={`Record a payment for ${kidName}`}>
          <PaymentFields draft={draft} onChange={setDraft} errors={errors} />
          <div className="flex gap-cis-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setErrors({});
              }}
              className="text-cis-sm font-bold text-cis-orange-text underline underline-offset-2 hover:text-cis-orange-deep"
            >
              Cancel
            </button>
            <PrimaryButton type="submit" className="ml-auto min-h-cis-tap-min px-5 text-cis-base" disabled={busy}>
              {busy ? 'Saving…' : 'Record'}
            </PrimaryButton>
          </div>
        </form>
      )}
    </div>
  );
}
