'use client';

/**
 * The parent registration flow: pick a kid (or add one) -> fill in the form ->
 * done.
 *
 * Built from the design system's rules and the roster and import screens, not
 * from a Claude Design prototype -- none exists (`DESIGN_SYSTEM.md` §10). Each
 * section of the form is its own sheet, 14px apart; the 5px rule under a
 * heading, and the 2px dashed break between the guardian and emergency-contact
 * blocks, are the only dividers. Nothing on it is colour-coded: a registration
 * is neither a score (ember) nor a verse (sage), so orange marks the one action
 * and ticked state, and everything else is ink.
 *
 * Validation runs here with the same `parentRegistrationSchema` the Server
 * Action uses, so errors appear without a round trip. The action re-validates
 * and the database re-checks, so this is a convenience, not a boundary.
 */

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ChoiceGroup, Field, SelectInput, TextInput, TickRow } from '@/components/cis/form';
import { PageShell } from '@/components/cis/page-shell';
import { PrimaryButton, SecondaryButton, secondaryButtonClasses } from '@/components/cis/button';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import {
  DIVISION_LABEL,
  REGISTRATION_GRADES,
  defaultDivision,
  type Division,
} from '@/lib/attendance';
import type { ParentKid } from '@/lib/registration/parent';
import { WAIVER_TITLE, WAIVER_URL } from '@/lib/registration/waiver';
import {
  GENDERS,
  TSHIRT_SIZES,
  parentRegistrationSchema,
  type Gender,
  type TshirtSize,
} from '@/lib/validation/kid';
import { registerKid } from './actions';

// ------------------------------------------------------------------ form state

interface FormState {
  first_name: string;
  last_name: string;
  dob: string;
  gender: Gender | '';
  email: string;
  phone: string;
  allergies: string;
  home_address: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  grade: string;
  division: Division | '';
  tshirt_size: TshirtSize | '';
  top_sports: string;
  consent: boolean;
}

const emptyForm: FormState = {
  first_name: '',
  last_name: '',
  dob: '',
  gender: '',
  email: '',
  phone: '',
  allergies: '',
  home_address: '',
  guardian_name: '',
  guardian_phone: '',
  guardian_email: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  grade: '',
  division: '',
  tshirt_size: '',
  top_sports: '',
  consent: false,
};

/**
 * A blank form for a new kid. When the parent already has a kid, the household
 * details are carried over -- a second child shares the address and both
 * contacts far more often than not, and retyping them is the most tedious part
 * of registering siblings. Everything about the child themselves stays blank.
 */
function newKidForm(existing: ParentKid | undefined): FormState {
  if (!existing) return emptyForm;
  return {
    ...emptyForm,
    home_address: existing.home_address,
    guardian_name: existing.guardian_name,
    guardian_phone: existing.guardian_phone,
    guardian_email: existing.guardian_email,
    emergency_contact_name: existing.emergency_contact_name,
    emergency_contact_phone: existing.emergency_contact_phone,
  };
}

/**
 * The form for a returning kid. The waiver is deliberately unticked: consent is
 * re-stamped on every save, so it has to be given again.
 */
function returningKidForm(kid: ParentKid): FormState {
  return {
    first_name: kid.first_name,
    last_name: kid.last_name,
    dob: kid.dob,
    gender: kid.gender,
    email: kid.email ?? '',
    phone: kid.phone ?? '',
    allergies: kid.allergies ?? '',
    home_address: kid.home_address,
    guardian_name: kid.guardian_name,
    guardian_phone: kid.guardian_phone,
    guardian_email: kid.guardian_email,
    emergency_contact_name: kid.emergency_contact_name,
    emergency_contact_phone: kid.emergency_contact_phone,
    grade: kid.registration ? String(kid.registration.grade) : '',
    division: kid.registration?.division ?? '',
    tshirt_size: (kid.registration?.tshirt_size as TshirtSize | undefined) ?? '',
    top_sports: kid.registration?.top_sports?.join(', ') ?? '',
    consent: false,
  };
}

function parseSports(text: string): string[] | null {
  const sports = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return sports.length > 0 ? sports : null;
}

/** The shape `parentRegistrationSchema` expects, from what is on screen. */
function buildInput(form: FormState, kidId: string | null) {
  const kid = {
    email: form.email,
    phone: form.phone,
    allergies: form.allergies,
    home_address: form.home_address,
    guardian_name: form.guardian_name,
    guardian_phone: form.guardian_phone,
    guardian_email: form.guardian_email,
    emergency_contact_name: form.emergency_contact_name,
    emergency_contact_phone: form.emergency_contact_phone,
  };
  const registration = {
    grade: form.grade === '' ? undefined : Number(form.grade),
    division: form.division || undefined,
    tshirt_size: form.tshirt_size || undefined,
    top_sports: parseSports(form.top_sports),
  };

  if (kidId) {
    return { mode: 'returning', kid_id: kidId, kid, registration, consent: form.consent };
  }
  return {
    mode: 'new',
    kid: {
      ...kid,
      first_name: form.first_name,
      last_name: form.last_name,
      dob: form.dob,
      gender: form.gender || undefined,
    },
    registration,
    consent: form.consent,
  };
}

const kidName = (kid: Pick<ParentKid, 'first_name' | 'last_name'>) =>
  `${kid.first_name} ${kid.last_name}`;

function formatDob(dob: string): string {
  const [y, m, d] = dob.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * What each kid's row says about their standing this season. A registration is
 * not complete until the waiver is agreed (`project_spec.md` §2.4), and a
 * CSV-imported one arrives without it -- so those say so rather than reading as
 * done, which is what tells the parent there is still something to do.
 */
function registrationStatus(kid: ParentKid): string {
  const reg = kid.registration;
  if (!reg) return 'Not registered this season';
  if (reg.on_team) return `Grade ${reg.grade} · On a team`;
  if (!reg.consent_given_at) return `Grade ${reg.grade} · Waiver needed`;
  return `Grade ${reg.grade} · Registered`;
}

/** The row's action: finish an incomplete registration, or review a complete one. */
function rowAction(kid: ParentKid): string {
  if (!kid.registration) return 'Register';
  return kid.registration.consent_given_at ? 'Review' : 'Finish';
}

// --------------------------------------------------------------------- screens

type Step =
  | { name: 'pick' }
  | { name: 'form'; kidId: string | null }
  | { name: 'done'; kidName: string; updated: boolean };

function Shell({ season, children }: { season: string; children: React.ReactNode }) {
  return (
    <PageShell className="max-w-[460px]">
      <div className="flex flex-col gap-1">
        <h1 className="font-cis-display text-cis-xl font-normal leading-[1.1]">Register a kid</h1>
        <p className="m-0 text-cis-sm font-semibold text-cis-ink-muted">{season}</p>
      </div>
      {children}
    </PageShell>
  );
}

/** The 2px dashed break inside a sheet (§6). */
function SectionBreak() {
  return <div className="my-cis-1 border-t-2 border-dashed border-cis-rule-dash" />;
}

export default function RegisterClient({
  season,
  kids,
}: {
  season: { id: string; name: string };
  kids: ParentKid[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(kids.length > 0 ? { name: 'pick' } : { name: 'form', kidId: null });
  const [form, setForm] = useState<FormState>(() => (kids.length > 0 ? emptyForm : newKidForm(undefined)));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // An error describes what was typed; once it changes, so does the error.
    setErrors((e) => {
      const rest = { ...e };
      delete rest[`kid.${key}`];
      delete rest[`registration.${key}`];
      delete rest[key];
      return rest;
    });
  };

  function setGrade(grade: string) {
    setForm((f) => {
      const n = Number(grade);
      // Below 7 is Juniors and above 7 is Ambassadors, so the division follows
      // the grade. Grade 7 may choose, so keep whatever was picked.
      const division = n === 7 ? f.division : (defaultDivision(n) ?? '');
      return { ...f, grade, division };
    });
    setErrors((e) => {
      const rest = { ...e };
      delete rest['registration.grade'];
      delete rest['registration.division'];
      return rest;
    });
  }

  const err = (path: string) => errors[path]?.[0];

  function openForm(kidId: string | null) {
    const kid = kidId ? kids.find((k) => k.id === kidId) : undefined;
    setForm(kid ? returningKidForm(kid) : newKidForm(kids[0]));
    setErrors({});
    setFormError(null);
    setStep({ name: 'form', kidId });
  }

  /**
   * The form is five sheets tall on a phone, and the submit button is at the
   * bottom, so a failed submit would otherwise leave the parent looking at a
   * button with every error out of view. Wait a frame so the `aria-invalid`
   * attributes from this render are in the DOM, then move focus to the first
   * one -- which also scrolls it into view.
   */
  function focusFirstInvalid() {
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"], fieldset[data-invalid="true"] input',
      );
      first?.focus();
    });
  }

  function submit(kidId: string | null) {
    setFormError(null);

    const parsed = parentRegistrationSchema.safeParse(buildInput(form, kidId));
    if (!parsed.success) {
      const found: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (found[issue.path.join('.')] ??= []).push(issue.message);
      }
      // Untouched selects reach the schema as `undefined`, which its enum and
      // number messages do not describe well -- say what to do instead.
      if (form.grade === '' && found['registration.grade']) {
        found['registration.grade'] = ['Choose a grade'];
      }
      if (form.tshirt_size === '' && found['registration.tshirt_size']) {
        found['registration.tshirt_size'] = ['Choose a T-shirt size'];
      }
      setErrors(found);
      setFormError('Please fix the fields marked above.');
      focusFirstInvalid();
      return;
    }

    startTransition(async () => {
      const result = await registerKid(parsed.data);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error ?? 'Could not save the registration.');
        if (result.fieldErrors) focusFirstInvalid();
        return;
      }
      setStep({
        name: 'done',
        kidName: `${form.first_name} ${form.last_name}`.trim(),
        updated: kidId !== null && Boolean(kids.find((k) => k.id === kidId)?.registration),
      });
      // Re-reads the kids, so the picker shows the new registration.
      router.refresh();
    });
  }

  // ------------------------------------------------------------------ 3 · Done
  if (step.name === 'done') {
    return (
      <Shell season={season.name}>
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
          <SheetHeading className="text-cis-xl">{step.updated ? 'Registration saved' : 'Registered'}</SheetHeading>
          <SheetRule />
          <div className="font-cis-display text-cis-display-md leading-[1.1]">{step.kidName}</div>
          <p className="m-0 text-cis-base leading-[1.5]">
            {step.updated
              ? `Their registration for ${season.name} is up to date.`
              : `is registered for ${season.name}.`}{' '}
            You can come back to this page to change their details until they are placed on a team.
          </p>
          <SectionBreak />
          <PrimaryButton block onClick={() => openForm(null)}>
            Register another kid
          </PrimaryButton>
          <Link href="/" className={`${secondaryButtonClasses} w-full`}>
            Back to home
          </Link>
        </Sheet>
      </Shell>
    );
  }

  // ------------------------------------------------------------------ 1 · Pick
  if (step.name === 'pick') {
    return (
      <Shell season={season.name}>
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-5 pt-cis-6">
          <SheetHeading>Who are you registering?</SheetHeading>
          <SheetRule />
          <ul className="m-0 flex list-none flex-col p-0">
            {kids.map((kid, i) => (
              <li key={kid.id} className={i > 0 ? 'border-t border-cis-rule' : undefined}>
                <button
                  type="button"
                  onClick={() => openForm(kid.id)}
                  className="flex min-h-cis-tap-primary w-full items-center justify-between gap-cis-3 py-cis-2 text-left active:scale-[.94] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-cis-orange"
                >
                  <span className="flex flex-col">
                    <span className="text-cis-md font-bold leading-[1.2]">{kidName(kid)}</span>
                    <span className="text-cis-sm font-semibold text-cis-ink-muted">
                      {registrationStatus(kid)}
                    </span>
                  </span>
                  <span className="text-cis-base font-bold text-cis-orange-text">
                    {rowAction(kid)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <SectionBreak />
          <SecondaryButton block onClick={() => openForm(null)}>
            Add another kid
          </SecondaryButton>
        </Sheet>
      </Shell>
    );
  }

  // ------------------------------------------------------------------ 2 · Form
  const kidId = step.kidId;
  const kid = kidId ? kids.find((k) => k.id === kidId) : undefined;
  const returning = kid !== undefined;

  // Grade and division drive team placement, so once an Admin has placed the
  // kid the parent can no longer change the registration (`register_kid()`
  // refuses it too, with the same reason).
  if (kid?.registration?.on_team) {
    return (
      <Shell season={season.name}>
        <Sheet tone="paper" className="flex flex-col gap-cis-3 px-cis-5 pb-cis-5 pt-cis-6">
          <SheetHeading>{kidName(kid)} is on a team</SheetHeading>
          <p className="m-0 text-cis-base leading-[1.5]">
            Their registration can no longer be changed here. Contact an Admin if something needs
            correcting.
          </p>
          <SecondaryButton block onClick={() => setStep({ name: 'pick' })}>
            Back
          </SecondaryButton>
        </Sheet>
      </Shell>
    );
  }

  const gradeNumber = form.grade === '' ? null : Number(form.grade);
  const divisionLocked = gradeNumber !== null && gradeNumber !== 7;
  const hasRegistration = Boolean(kid?.registration);
  const submitLabel = pending
    ? 'Saving…'
    : hasRegistration
      ? 'Save changes'
      : returning
        ? `Register ${kid.first_name}`
        : 'Register';

  return (
    <Shell season={season.name}>
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(kidId);
        }}
        className="flex flex-col gap-cis-4"
      >
        {/* ----------------------------------------------------- About the kid */}
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
          <SheetHeading>{returning ? `About ${kid.first_name}` : 'About your kid'}</SheetHeading>
          <SheetRule />

          {returning ? (
            // Locked: these are how a returning kid is matched across seasons,
            // so a parent cannot edit them. Shown, not hidden, so it is clear
            // whose record this is and why nothing here is editable.
            <div className="flex flex-col gap-cis-2">
              <dl className="m-0 flex flex-col">
                {[
                  ['Name', kidName(kid)],
                  ['Date of birth', formatDob(kid.dob)],
                  ['Gender', kid.gender === 'male' ? 'Male' : 'Female'],
                ].map(([term, value], i) => (
                  <div
                    key={term}
                    className={`flex justify-between gap-cis-3 py-cis-2 ${i > 0 ? 'border-t border-cis-rule' : ''}`}
                  >
                    <dt className="text-cis-base font-semibold text-cis-ink-muted">{term}</dt>
                    <dd className="m-0 text-right text-cis-base font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="m-0 text-cis-sm font-semibold leading-[1.4] text-cis-ink-muted">
                To correct a name, birthday or gender, ask an Admin.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-cis-3">
                <div className="min-w-0 flex-1">
                  <Field label="First name" error={err('kid.first_name')}>
                    {(p) => (
                      <TextInput
                        {...p}
                        autoComplete="given-name"
                        value={form.first_name}
                        onChange={(e) => set('first_name', e.target.value)}
                      />
                    )}
                  </Field>
                </div>
                <div className="min-w-0 flex-1">
                  <Field label="Last name" error={err('kid.last_name')}>
                    {(p) => (
                      <TextInput
                        {...p}
                        autoComplete="family-name"
                        value={form.last_name}
                        onChange={(e) => set('last_name', e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              </div>
              <Field label="Date of birth" error={err('kid.dob')}>
                {(p) => (
                  <TextInput
                    {...p}
                    type="date"
                    value={form.dob}
                    onChange={(e) => set('dob', e.target.value)}
                  />
                )}
              </Field>
              <ChoiceGroup
                name="gender"
                legend="Gender"
                error={err('kid.gender')}
                choices={GENDERS.map((g) => ({ value: g, label: g === 'male' ? 'Male' : 'Female' }))}
                value={form.gender}
                onChange={(v) => set('gender', v)}
              />
            </>
          )}

          <Field label="Allergies" optional hint="Leave blank if none." error={err('kid.allergies')}>
            {(p) => (
              <TextInput {...p} value={form.allergies} onChange={(e) => set('allergies', e.target.value)} />
            )}
          </Field>
          <Field label="Home address" error={err('kid.home_address')}>
            {(p) => (
              <TextInput
                {...p}
                autoComplete="street-address"
                value={form.home_address}
                onChange={(e) => set('home_address', e.target.value)}
              />
            )}
          </Field>
          <Field label="Kid's email" optional error={err('kid.email')}>
            {(p) => (
              <TextInput
                {...p}
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            )}
          </Field>
          <Field label="Kid's phone" optional error={err('kid.phone')}>
            {(p) => (
              <TextInput
                {...p}
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            )}
          </Field>
        </Sheet>

        {/* ----------------------------------------------------- This season */}
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
          <SheetHeading>This season</SheetHeading>
          <SheetRule />
          <Field label="Grade" error={err('registration.grade')}>
            {(p) => (
              <SelectInput {...p} value={form.grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">Choose a grade</option>
                {REGISTRATION_GRADES.map((g) => (
                  <option key={g} value={String(g)}>
                    Grade {g}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <ChoiceGroup
            name="division"
            legend="Division"
            hint={
              gradeNumber === null
                ? 'Choose a grade first.'
                : divisionLocked
                  ? 'Set by grade.'
                  : 'Grade 7 may choose either division.'
            }
            error={err('registration.division')}
            choices={(['juniors', 'ambassadors'] as const).map((d) => ({
              value: d,
              label: DIVISION_LABEL[d],
            }))}
            value={form.division}
            onChange={(v) => set('division', v)}
            disabled={gradeNumber === null || divisionLocked}
          />
          <ChoiceGroup
            name="tshirt_size"
            legend="T-shirt size"
            error={err('registration.tshirt_size')}
            choices={TSHIRT_SIZES.map((s) => ({ value: s, label: s }))}
            value={form.tshirt_size}
            onChange={(v) => set('tshirt_size', v)}
          />
          <Field label="Top sports" optional hint="Separate with commas." error={err('registration.top_sports')}>
            {(p) => (
              <TextInput
                {...p}
                placeholder="Soccer, basketball"
                value={form.top_sports}
                onChange={(e) => set('top_sports', e.target.value)}
              />
            )}
          </Field>
        </Sheet>

        {/* ------------------------------------------------------- Contacts */}
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
          <SheetHeading>Parent or guardian</SheetHeading>
          <SheetRule />
          <Field label="Name" error={err('kid.guardian_name')}>
            {(p) => (
              <TextInput
                {...p}
                autoComplete="name"
                value={form.guardian_name}
                onChange={(e) => set('guardian_name', e.target.value)}
              />
            )}
          </Field>
          <Field label="Phone" error={err('kid.guardian_phone')}>
            {(p) => (
              <TextInput
                {...p}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.guardian_phone}
                onChange={(e) => set('guardian_phone', e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Email"
            hint="We match your kids to your account by this address."
            error={err('kid.guardian_email')}
          >
            {(p) => (
              <TextInput
                {...p}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.guardian_email}
                onChange={(e) => set('guardian_email', e.target.value)}
              />
            )}
          </Field>

          <SectionBreak />

          <SheetHeading>Emergency contact</SheetHeading>
          <Field label="Name" error={err('kid.emergency_contact_name')}>
            {(p) => (
              <TextInput
                {...p}
                value={form.emergency_contact_name}
                onChange={(e) => set('emergency_contact_name', e.target.value)}
              />
            )}
          </Field>
          <Field label="Phone" error={err('kid.emergency_contact_phone')}>
            {(p) => (
              <TextInput
                {...p}
                type="tel"
                inputMode="tel"
                value={form.emergency_contact_phone}
                onChange={(e) => set('emergency_contact_phone', e.target.value)}
              />
            )}
          </Field>
        </Sheet>

        {/* --------------------------------------------------------- Waiver */}
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
          <SheetHeading>{WAIVER_TITLE}</SheetHeading>
          <SheetRule />
          {/* The waiver is a document the program hosts, so this links to it
              rather than reproducing it. New tab, so the half-filled form is
              still there when the parent comes back. */}
          <p className="m-0 text-cis-base leading-[1.45]">
            <a
              href={WAIVER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-cis-orange-text underline underline-offset-2 hover:text-cis-orange-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-cis-orange"
            >
              Read the liability waiver
            </a>
            {/* Outside the link: text-decoration propagates into children, so
                inside it this would be underlined like the link itself. */}
            <span className="font-semibold text-cis-ink-muted"> (opens in a new tab)</span>
          </p>
          <TickRow
            checked={form.consent}
            onChange={(v) => set('consent', v)}
            error={err('consent')}
          >
            I have read and agree to the liability waiver.
          </TickRow>

          {formError && (
            <p role="alert" className="m-0 text-cis-base font-bold leading-[1.45]">
              {formError}
            </p>
          )}

          <SectionBreak />
          <div className="flex gap-cis-3">
            {kids.length > 0 && (
              <SecondaryButton type="button" disabled={pending} onClick={() => setStep({ name: 'pick' })}>
                Back
              </SecondaryButton>
            )}
            <PrimaryButton type="submit" disabled={pending} className="flex-1">
              {submitLabel}
            </PrimaryButton>
          </div>
        </Sheet>
      </form>
    </Shell>
  );
}
