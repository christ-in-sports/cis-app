'use client';

/**
 * The servant registration form: one screen, editable at any time.
 *
 * Built from the design system's rules and the parent registration screen, not
 * from a Claude Design prototype -- none exists (`DESIGN_SYSTEM.md` §10), so
 * treat the layout as provisional. Each section is its own sheet, 14px apart.
 * Nothing on it is colour-coded: a registration is neither a score (ember) nor a
 * verse (sage), so orange marks the one action and ticked state.
 *
 * Validation runs here with the same `servantRegistrationSchema` the Server
 * Action uses, so errors appear without a round trip. The action re-validates
 * and the database re-checks, so this is a convenience, not a boundary.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';

import { BoardHeader, BoardShell } from '@/components/cis/board-shell';
import { Icon } from '@/components/cis/icon';
import { PrimaryButton, SecondaryButton, secondaryButtonClasses } from '@/components/cis/button';
import {
  ChoiceGroup,
  Field,
  FieldError,
  TextArea,
  TextInput,
  TickRow,
} from '@/components/cis/form';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import {
  SERVANT_INTRO,
  type ServantRegistrationRecord,
  type ServantSeason,
} from '@/lib/registration/servant-form';
import {
  EVALUATION_STATUSES,
  SERVANT_GENDERS,
  SERVANT_SESSIONS,
  SERVANT_SUBTEAMS,
  SUBTEAM_LABELS,
  servantRegistrationSchema,
  type ServantSession,
  type ServantSubteam,
} from '@/lib/validation/servant';
import { submitServantRegistration } from './actions';

// ------------------------------------------------------------------ form state

interface FormState {
  full_name: string;
  evaluation_status: (typeof EVALUATION_STATUSES)[number] | '';
  serving: 'yes' | 'no' | '';
  sessions: ServantSession[];
  juniors_subteams: ServantSubteam[];
  ambassadors_subteams: ServantSubteam[];
  juniors_other: string;
  ambassadors_other: string;
  notes: string;
  dates_missing: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  gender: (typeof SERVANT_GENDERS)[number] | '';
  dob: string;
  home_address: string;
}

const emptyForm: FormState = {
  full_name: '',
  evaluation_status: '',
  serving: '',
  sessions: [],
  juniors_subteams: [],
  ambassadors_subteams: [],
  juniors_other: '',
  ambassadors_other: '',
  notes: '',
  dates_missing: '',
  phone: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  gender: '',
  dob: '',
  home_address: '',
};

function formFrom(record: ServantRegistrationRecord | null): FormState {
  if (!record) return emptyForm;
  return {
    full_name: record.full_name,
    evaluation_status: record.evaluation_status,
    serving: record.is_serving ? 'yes' : 'no',
    sessions: record.sessions ?? [],
    juniors_subteams: record.juniors_subteams ?? [],
    ambassadors_subteams: record.ambassadors_subteams ?? [],
    juniors_other: record.juniors_other ?? '',
    ambassadors_other: record.ambassadors_other ?? '',
    notes: record.notes ?? '',
    // Dates missing are about one season. Prefilled from last season they would
    // be wrong, so the caller clears them; an edit of this season's keeps them.
    dates_missing: record.dates_missing ?? '',
    phone: record.phone,
    emergency_contact_name: record.emergency_contact_name,
    emergency_contact_phone: record.emergency_contact_phone,
    gender: record.gender,
    dob: record.dob,
    home_address: record.home_address,
  };
}

/** The shape `servantRegistrationSchema` expects, from what is on screen. */
function buildInput(form: FormState) {
  return {
    full_name: form.full_name,
    evaluation_status: form.evaluation_status || undefined,
    is_serving: form.serving === '' ? undefined : form.serving === 'yes',
    sessions: form.sessions,
    juniors_subteams: form.juniors_subteams,
    ambassadors_subteams: form.ambassadors_subteams,
    juniors_other: form.juniors_other,
    ambassadors_other: form.ambassadors_other,
    notes: form.notes,
    dates_missing: form.dates_missing,
    phone: form.phone,
    emergency_contact_name: form.emergency_contact_name,
    emergency_contact_phone: form.emergency_contact_phone,
    gender: form.gender || undefined,
    dob: form.dob,
    home_address: form.home_address,
  };
}

const SESSION_LABEL: Record<ServantSession, string> = {
  juniors: 'Juniors',
  ambassadors: 'Ambassadors',
};

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSaved(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The 2px dashed break inside a sheet (§6). */
function SectionBreak() {
  return <div className="my-cis-1 border-t-2 border-dashed border-cis-rule-dash" />;
}

// ------------------------------------------------------------------ the screen

export default function ServantClient({
  season,
  email,
  hasRole,
  registration,
  prefilled,
}: {
  season: ServantSeason;
  email: string;
  hasRole: boolean;
  registration: ServantRegistrationRecord | null;
  /** `registration` is from an earlier season: nothing is saved for this one yet. */
  prefilled: boolean;
}) {
  const [form, setForm] = useState<FormState>(() => {
    const initial = formFrom(registration);
    return prefilled ? { ...initial, dates_missing: '' } : initial;
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Set after a first-time submit: the form gives way to a confirmation screen.
  // `updated` is a later save, not the first: no email was sent for it.
  const [confirmed, setConfirmed] = useState<{ emailFailed: boolean; updated: boolean } | null>(null);
  // The servant came back to the form from the confirmation screen, so saving
  // returns them there. Lives in memory only: a fresh visit starts without it,
  // and then a save keeps them on the form.
  const [fromConfirmation, setFromConfirmation] = useState(false);
  // Briefly true after an edit is saved, so the button and a status line can say so.
  const [justSaved, setJustSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(
    registration && !prefilled ? registration.updated_at : null,
  );
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // What was last saved (or first shown), to tell whether there is anything unsaved.
  const baseline = useRef<string>('');
  if (baseline.current === '') baseline.current = JSON.stringify(form);
  const dirty = JSON.stringify(form) !== baseline.current;
  const hasSaved = lastSaved !== null;

  // The form is long and an edit is easy to lose; ask before the page is closed.
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  // The "Saved" state is a moment, not a mode.
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  const err = (path: string) => errors[path]?.[0];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setJustSaved(false);
    // An error describes what was typed; once it changes, so does the error.
    setErrors((e) => {
      const rest = { ...e };
      delete rest[key];
      if (key === 'serving') delete rest.sessions;
      return rest;
    });
  };

  const toggle = <T extends string>(list: T[], value: T, on: boolean): T[] =>
    on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);

  function toggleSession(session: ServantSession, on: boolean) {
    set('sessions', toggle(form.sessions, session, on));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[`${session}_subteams`];
      return rest;
    });
  }

  /** The form is long on a phone and the button is at the bottom: jump to the first error. */
  function focusFirstInvalid() {
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"], fieldset[data-invalid="true"] input',
      );
      first?.focus();
    });
  }

  function submit() {
    setFormError(null);
    setJustSaved(false);

    const parsed = servantRegistrationSchema.safeParse(buildInput(form));
    if (!parsed.success) {
      const found: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (found[issue.path.join('.')] ??= []).push(issue.message);
      }
      // Untouched choices reach the schema as `undefined`, whose enum messages
      // do not say what to do.
      if (found.is_serving) found.is_serving = ['Say whether you are serving this season'];
      if (found.evaluation_status) found.evaluation_status = ['Choose Completed or Not Completed'];
      if (found.gender) found.gender = ['Choose Female or Male'];
      setErrors(found);
      setFormError('Please fix the fields marked above.');
      focusFirstInvalid();
      return;
    }

    startTransition(async () => {
      const result = await submitServantRegistration(parsed.data);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error ?? 'Could not save your registration.');
        if (result.fieldErrors) focusFirstInvalid();
        return;
      }
      setErrors({});
      baseline.current = JSON.stringify(form);
      setLastSaved(new Date().toISOString());
      if (result.isNew || fromConfirmation) {
        // First time, or an edit made from the confirmation screen: a screen of
        // its own, so the confirmation cannot be missed below the fold of a long form.
        setConfirmed({ emailFailed: result.emailFailed === true, updated: !result.isNew });
        window.scrollTo({ top: 0 });
      } else {
        setJustSaved(true);
      }
    });
  }

  const serving = form.serving === 'yes';

  if (confirmed) {
    return (
      <BoardShell>
        <BoardHeader kicker="Servants" title="My registration" meta={season.name} />
        <RegistrationColumn>
          <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
            <div role="status" className="flex flex-col gap-cis-3">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center rounded-cis-box border-[3px] border-cis-orange bg-cis-orange text-cis-display-md font-extrabold text-cis-ink-dark"
              >
                ✓
              </span>
              <SheetHeading className="text-cis-xl">
                {confirmed.updated ? 'Changes saved' : 'You are registered'}
              </SheetHeading>
              <p className="m-0 text-cis-base leading-[1.5]">
                {confirmed.updated
                  ? `Your registration for ${season.name} is up to date.`
                  : `Thank you, ${form.full_name.trim().split(/\s+/)[0]}. Your registration for ${season.name} is saved.`}
              </p>
            </div>
            <SheetRule />
            <dl className="m-0 flex flex-col gap-cis-2 text-cis-base">
              <div>
                <dt className="font-bold">Serving this season</dt>
                <dd className="m-0">{serving ? 'Yes' : 'No'}</dd>
              </div>
              {serving &&
                SERVANT_SESSIONS.filter((s) => form.sessions.includes(s)).map((session) => {
                  const teams = SERVANT_SUBTEAMS.filter((t) =>
                    form[`${session}_subteams`].includes(t),
                  ).map((t) => SUBTEAM_LABELS[t]);
                  const other = form[`${session}_other`].trim();
                  if (other) teams.push(`Other: ${other}`);
                  return (
                    <div key={session}>
                      <dt className="font-bold">{SESSION_LABEL[session]}</dt>
                      <dd className="m-0">{teams.join(', ')}</dd>
                    </div>
                  );
                })}
            </dl>
            <SectionBreak />
            {!confirmed.updated && (
              <p className="m-0 text-cis-base leading-[1.5]">
                {confirmed.emailFailed
                  ? 'We could not send your confirmation email, but your registration is saved.'
                  : `A confirmation email is on its way to ${email}.`}
              </p>
            )}
            <p className="m-0 text-cis-base leading-[1.5]">
              {hasRole
                ? 'Your team choices are preferences. You can change your answers any time.'
                : 'Your team choices are preferences. An Admin will assign your role; until then this page is all you will see. You can change your answers any time.'}
            </p>
            <PrimaryButton
              block
              onClick={() => {
                setConfirmed(null);
                setFromConfirmation(true);
              }}
            >
              Edit my answers
            </PrimaryButton>
            {hasRole && (
              <Link href="/" className={`${secondaryButtonClasses} w-full`}>
                Back to home
              </Link>
            )}
          </Sheet>
        </RegistrationColumn>
      </BoardShell>
    );
  }

  return (
    <BoardShell>
      <BoardHeader
        kicker="Servants"
        title="My registration"
        meta={season.name}
        action={
          hasRole ? (
            <Link href="/" className="text-cis-sm font-bold text-cis-orange-text underline">
              Home
            </Link>
          ) : undefined
        }
      />
      <RegistrationColumn>
        <Sheet tone="paper" className="flex flex-col gap-cis-2 px-cis-5 pb-cis-5 pt-cis-5">
          <SheetHeading className="text-cis-xl">{season.name}</SheetHeading>
          <p className="m-0 text-cis-base leading-[1.5]">
            The season starts on {formatDay(season.starts_on)}. {SERVANT_INTRO.sessions}{' '}
            {SERVANT_INTRO.meeting}
          </p>
          <p className="m-0 text-cis-base leading-[1.5]">
            Tell us whether you are serving and where you would like to help. Your team choices are
            preferences; an Admin gives you your role.
          </p>
          {prefilled && (
            <p className="m-0 text-cis-base font-bold leading-[1.5]">
              We filled this in from your last registration. Check it and save.
            </p>
          )}
        </Sheet>

        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3.5"
        >
          {/* ------------------------------------------------------- About you */}
          <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
            <SheetHeading>About you</SheetHeading>
            <SheetRule />
            <Field label="Name" error={err('full_name')}>
              {(p) => (
                <TextInput
                  {...p}
                  autoComplete="name"
                  value={form.full_name}
                  onChange={(e) => set('full_name', e.target.value)}
                />
              )}
            </Field>
            <ChoiceGroup
              name="evaluation_status"
              legend="Service Evaluation Status"
              error={err('evaluation_status')}
              choices={[
                { value: 'completed', label: 'Completed' },
                { value: 'not_completed', label: 'Not Completed' },
              ]}
              value={form.evaluation_status}
              onChange={(v) => set('evaluation_status', v)}
            />
            <ChoiceGroup
              name="serving"
              legend="Are you serving this season?"
              error={err('is_serving')}
              choices={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={form.serving}
              onChange={(v) => set('serving', v)}
            />
          </Sheet>

          {/* ----------------------------------------------- Sessions and teams */}
          {serving && (
            <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
              <SheetHeading>Where will you serve?</SheetHeading>
              <SheetRule />
              <fieldset
                className="m-0 flex min-w-0 flex-col border-0 p-0"
                data-invalid={err('sessions') ? true : undefined}
              >
                <legend className="mb-1 p-0 text-cis-base font-bold leading-[1.3]">
                  Which sessions can you serve?
                </legend>
                {SERVANT_SESSIONS.map((session) => (
                  <TickRow
                    key={session}
                    checked={form.sessions.includes(session)}
                    onChange={(on) => toggleSession(session, on)}
                  >
                    {SESSION_LABEL[session]}
                  </TickRow>
                ))}
                {err('sessions') && <FieldError>{err('sessions')}</FieldError>}
              </fieldset>

              {SERVANT_SESSIONS.filter((s) => form.sessions.includes(s)).map((session) => {
                const teams = form[`${session}_subteams`];
                const other = form[`${session}_other`];
                const path = `${session}_subteams`;
                return (
                  <div key={session} className="flex flex-col gap-cis-2">
                    <SectionBreak />
                    <fieldset
                      className="m-0 flex min-w-0 flex-col border-0 p-0"
                      data-invalid={err(path) ? true : undefined}
                    >
                      <legend className="mb-1 p-0 text-cis-base font-bold leading-[1.3]">
                        {SESSION_LABEL[session]}: which teams would you like to serve on?
                      </legend>
                      {SERVANT_SUBTEAMS.map((team) => (
                        <TickRow
                          key={team}
                          checked={teams.includes(team)}
                          onChange={(on) => {
                            set(`${session}_subteams`, toggle(teams, team, on));
                            setErrors((e) => {
                              const rest = { ...e };
                              delete rest[path];
                              return rest;
                            });
                          }}
                        >
                          {SUBTEAM_LABELS[team]}
                        </TickRow>
                      ))}
                      {err(path) && <FieldError>{err(path)}</FieldError>}
                    </fieldset>
                    <Field label={`${SESSION_LABEL[session]}: Other`} optional>
                      {(p) => (
                        <TextInput
                          {...p}
                          value={other}
                          onChange={(e) => {
                            set(`${session}_other`, e.target.value);
                            setErrors((er) => {
                              const rest = { ...er };
                              delete rest[path];
                              return rest;
                            });
                          }}
                        />
                      )}
                    </Field>
                  </div>
                );
              })}
            </Sheet>
          )}

          {/* ----------------------------------------------------------- Notes */}
          <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
            <SheetHeading>Notes</SheetHeading>
            <SheetRule />
            <Field
              label="Notes about your team choices or commitment"
              optional
              error={err('notes')}
            >
              {(p) => (
                <TextArea
                  {...p}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Dates you will miss"
              optional
              hint="For the Admins' information. It is not added to the calendar."
              error={err('dates_missing')}
            >
              {(p) => (
                <TextArea
                  {...p}
                  value={form.dates_missing}
                  onChange={(e) => set('dates_missing', e.target.value)}
                />
              )}
            </Field>
          </Sheet>

          {/* --------------------------------------------------------- Contact */}
          <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
            <SheetHeading>Contact details</SheetHeading>
            <SheetRule />
            <Field label="Email" hint="This is the email you sign in with.">
              {(p) => <TextInput {...p} type="email" value={email} readOnly />}
            </Field>
            <Field label="Phone" error={err('phone')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              )}
            </Field>
            <ChoiceGroup
              name="gender"
              legend="Gender"
              error={err('gender')}
              choices={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
              ]}
              value={form.gender}
              onChange={(v) => set('gender', v)}
            />
            <Field label="Date of birth" error={err('dob')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="date"
                  autoComplete="bday"
                  value={form.dob}
                  onChange={(e) => set('dob', e.target.value)}
                />
              )}
            </Field>
            <Field label="Home address" error={err('home_address')}>
              {(p) => (
                <TextInput
                  {...p}
                  autoComplete="street-address"
                  value={form.home_address}
                  onChange={(e) => set('home_address', e.target.value)}
                />
              )}
            </Field>
            <SectionBreak />
            <Field label="Emergency contact name" error={err('emergency_contact_name')}>
              {(p) => (
                <TextInput
                  {...p}
                  value={form.emergency_contact_name}
                  onChange={(e) => set('emergency_contact_name', e.target.value)}
                />
              )}
            </Field>
            <Field label="Emergency contact phone" error={err('emergency_contact_phone')}>
              {(p) => (
                <TextInput
                  {...p}
                  type="tel"
                  value={form.emergency_contact_phone}
                  onChange={(e) => set('emergency_contact_phone', e.target.value)}
                />
              )}
            </Field>
          </Sheet>

          {/* ---------------------------------------------------------- Submit */}
          <Sheet tone="paper" className="flex flex-col gap-cis-3 px-cis-5 pb-cis-5 pt-cis-5">
            {formError && <FieldError>{formError}</FieldError>}
            <PrimaryButton type="submit" block disabled={pending}>
              {pending ? 'Saving…' : justSaved ? 'Saved ✓' : hasSaved ? 'Save changes' : 'Register'}
            </PrimaryButton>
            {/* Always in the DOM, so a screen reader announces the change. */}
            <p
              role="status"
              className="m-0 flex items-center justify-center gap-1.5 text-center text-cis-sm font-bold text-cis-ink"
            >
              {justSaved ? (
                <>
                  <Icon name="check" size={16} className="shrink-0" />
                  Changes saved
                </>
              ) : dirty && hasSaved ? (
                'You have unsaved changes'
              ) : null}
            </p>
            {lastSaved && (
              <p className="m-0 text-center text-cis-sm font-semibold text-cis-ink-muted">
                Last saved {formatSaved(lastSaved)}
              </p>
            )}
            {hasRole && (
              <Link href="/" className={`${secondaryButtonClasses} w-full`}>
                Back to home
              </Link>
            )}
          </Sheet>
        </form>
      </RegistrationColumn>
    </BoardShell>
  );
}
