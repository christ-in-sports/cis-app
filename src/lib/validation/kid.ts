/**
 * The shared `Kid` + `Registration` validation schema.
 *
 * This is the single source of truth for the shape of a registration
 * (`project_spec.md` §2.5), and it is deliberately free of any CSV concepts so
 * that the parent self-service form (ENG-4) can reuse it unchanged. The CSV
 * importer's header mapping and cell coercion live in `src/lib/import/csv/`,
 * which feeds *into* these schemas rather than altering them.
 *
 * Every rule here mirrors a constraint in
 * `supabase/migrations/20260922180000_kids_and_registrations.sql`. The database
 * is the real boundary -- registrations arrive by three paths (parent form, kid
 * self-registration, CSV import), so validating only here would let bad rows in
 * through the others. These schemas exist to produce readable, per-field errors
 * *before* the database rejects a write, not instead of it.
 *
 * The object schemas are exported un-refined (`kidSchema`,
 * `registrationCoreSchema`) so a multi-step form can `.pick()` or `.partial()`
 * them. Use `registrationSchema` when validating a whole registration, since
 * that is the one carrying the cross-field grade/division rule.
 */

import { z } from 'zod';
import { defaultDivision, divisionAllowedForGrade, type Division } from '@/lib/attendance';

/** Matches the `gender` CHECK on `kids`. Stored lower-case. */
export const GENDERS = ['male', 'female'] as const;

/** Matches the `registrations_tshirt_size_values` CHECK. */
export const TSHIRT_SIZES = ['YS', 'YM', 'YL', 'XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

/** Matches the `registrations_division_values` CHECK. */
export const DIVISIONS = ['juniors', 'ambassadors'] as const;

export type Gender = (typeof GENDERS)[number];
export type TshirtSize = (typeof TSHIRT_SIZES)[number];

/**
 * A required free-text field. Trimmed first so a cell of only whitespace is
 * rejected rather than stored as blank -- these back NOT NULL columns.
 */
const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required`);

/**
 * Treats a blank or whitespace-only string as absent.
 *
 * Both input paths produce blanks for "no answer" -- an empty CSV cell and an
 * untouched form input -- and every optional field here backs a nullable
 * column, so a blank means null rather than an error. Deliberately NOT
 * `.catch()`, which would swallow genuine validation failures (a malformed
 * email would silently become null instead of being reported).
 */
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema);

/** An optional free-text field. `null` is the absent value, matching the column. */
const optionalText = blankToNull(z.string().trim().min(1).nullable());

/**
 * Stable identity, contact and medical data -- the fields that do NOT change
 * from season to season (`project_spec.md` §2.4).
 *
 * The kid's own email and phone are optional; the guardian's are not. That
 * asymmetry is intentional: a 10-year-old may have neither, but there must
 * always be a reachable adult.
 */
export const kidSchema = z.object({
  first_name: requiredText('First name'),
  last_name: requiredText('Last name'),
  dob: z.iso.date('Date of birth must be a valid date'),
  gender: z.enum(GENDERS, 'Gender must be Male or Female'),

  // Object path inside the private kid-photos bucket, never a URL. Null until
  // the importer copies the photo across from Google Drive (a later PR, blocked
  // on Drive API access).
  photo_path: optionalText.default(null),

  email: blankToNull(
    z.email('Kid email is not a valid email address').nullable(),
  ).default(null),
  phone: optionalText.default(null),
  allergies: optionalText.default(null),

  home_address: requiredText('Home address'),
  emergency_contact_name: requiredText('Emergency contact name'),
  emergency_contact_phone: requiredText('Emergency contact phone'),

  guardian_name: requiredText('Parent/guardian name'),
  guardian_phone: requiredText('Parent/guardian phone'),
  guardian_email: z.email('Parent/guardian email is not a valid email address'),

  skill_tags: z.array(z.string().trim().min(1)).default([]),
});

/**
 * The per-season fields, without the cross-field rule applied.
 *
 * Server-managed columns (`source`, `active`, `created_by`, `consent_*`,
 * `team_id`, timestamps) are deliberately absent: they are set by whichever
 * path performs the write, not supplied by a CSV cell or a form input.
 * Consent in particular is recorded server-side (`project_spec.md` §2.4).
 */
export const registrationCoreSchema = z.object({
  grade: z
    .int('Grade must be a whole number')
    .min(4, 'Grade must be between 4 and 12')
    .max(12, 'Grade must be between 4 and 12'),
  division: z.enum(DIVISIONS, 'Division must be Juniors or Ambassadors'),
  tshirt_size: z.enum(
    TSHIRT_SIZES,
    `T-shirt size must be one of ${TSHIRT_SIZES.join(', ')}`,
  ),
  top_sports: z.array(z.string().trim().min(1)).nullable().default(null),
});

/**
 * The grade/division rule: below grade 7 must be Juniors, above grade 7 must be
 * Ambassadors, and grade 7 may choose either (`project_spec.md` §1.1).
 *
 * Exported separately so ENG-4's form can apply the same rule to its own
 * assembled shape without depending on this module's exact object type.
 *
 * The issue is attached to `division` rather than the object root on purpose:
 * a form needs it next to the division field, and the CSV importer maps the
 * issue path back to a spreadsheet column so the Admin is told *which column*
 * on which row to fix.
 *
 * Note this still runs when `grade` has already failed its own range check, so
 * it must not assume `grade` is 4-12.
 */
export function refineGradeDivision(
  value: { grade: number; division: Division },
  ctx: z.RefinementCtx,
): void {
  if (divisionAllowedForGrade(value.grade, value.division)) return;

  const expected = defaultDivision(value.grade);

  // An out-of-range grade has no division it *should* be, and `grade` already
  // carries its own error. Emitting a second issue here would read as
  // "Grade 3 must be registered as null", so say nothing and let the grade
  // error stand on its own.
  if (expected === null) return;

  ctx.addIssue({
    code: 'custom',
    path: ['division'],
    message: `Grade ${value.grade} must be registered as ${expected}`,
  });
}

/** A full season registration, including the grade/division rule. */
export const registrationSchema = registrationCoreSchema.superRefine(refineGradeDivision);

/** One CSV row / one form submission: a kid plus their registration. */
export const kidRegistrationSchema = z.object({
  kid: kidSchema,
  registration: registrationSchema,
});

export type KidInput = z.infer<typeof kidSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type KidRegistrationInput = z.infer<typeof kidRegistrationSchema>;
