/**
 * Maps the Admin's CSV headers onto the fields the domain schema expects.
 *
 * The CSV is an export of the parents' Google Form responses, so the headers are
 * the form's question text -- long, punctuated, and liable to be reworded between
 * seasons. Matching is therefore done on a normalised form (lower-case,
 * alphanumerics only), with an exact table first and looser patterns as a
 * fallback.
 *
 * This module knows nothing about validation. It answers only "which column
 * holds which field", so that `rows.ts` can pull cells out by field name and
 * hand them to `src/lib/validation/kid.ts`.
 *
 * The header table below was checked against a real 149-row export of the
 * 2026-27 form on 2026-09-22. Headers are still matched loosely rather than
 * exactly, because the form's wording drifts between seasons -- the real export
 * already differs from the previous importer's table, and several headers
 * carry stray trailing spaces and colons. `unmapped` on the result
 * exists so the review screen can show an Admin exactly which of their columns
 * were not understood, rather than failing silently.
 */

/** A field the importer can read out of a CSV row. */
export type CsvField =
  | 'first_name'
  | 'last_name'
  | 'dob'
  | 'gender'
  | 'kid_email'
  | 'kid_phone'
  | 'allergies'
  | 'home_address'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
  | 'guardian_name'
  | 'guardian_phone'
  | 'guardian_email'
  | 'grade'
  | 'division_choice'
  | 'tshirt_size'
  // The form asks for top sports twice, once per division. Kids do not reliably
  // answer only the one meant for them, so both are read and `rows.ts` picks.
  | 'top_sports_ambassadors'
  | 'top_sports_juniors'
  // Read for the Admin's review screen only, never written to the database.
  // The two consent questions disagree often enough that both are needed to
  // tell a real claim from a contradictory one -- see `consentClaim` in rows.ts.
  | 'consent_claim'
  | 'consent_method';

/**
 * Human-readable names used in row-level error messages when the CSV's own
 * header is unavailable (for example a field that has no column at all).
 */
export const FIELD_LABEL: Record<CsvField, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  dob: 'DOB',
  gender: 'Gender',
  kid_email: 'Youth email',
  kid_phone: 'Youth phone number',
  allergies: 'Allergies',
  home_address: 'Home address',
  emergency_contact_name: 'Emergency contact name',
  emergency_contact_phone: 'Emergency contact number',
  guardian_name: 'Parent/guardian',
  guardian_phone: 'Parent/guardian phone number',
  guardian_email: 'Parent/guardian email',
  grade: 'Grade',
  division_choice: 'Session choice (7th grade only)',
  tshirt_size: 'Youth tshirt size',
  top_sports_ambassadors: 'Top sports (Ambassadors)',
  top_sports_juniors: 'Top sports (Juniors)',
  consent_claim: 'Have you filled out a consent form?',
  consent_method: 'How the consent form will be returned',
};

/**
 * Columns that exist in the export but hold nothing the schema wants.
 *
 * `emailaddress` is Google Forms' automatic respondent field, and the previous
 * importer read it as the *kid's* email. Measured against the real export, that
 * is wrong: it equals the parent's address in only 78 of 149 rows, and the
 * kid's in 13 of the 88 rows that have one. It is whoever happened to be signed
 * in, so it is dropped in favour of the two explicit questions.
 *
 * Payment is out of scope for ENG-5 entirely.
 *
 * The consent columns are NOT ignored -- see `consent_claim` / `consent_method`
 * below. They are read for the review screen but never written to the database.
 */
const IGNORED_HEADERS = new Set(['timestamp', 'emailaddress']);

/**
 * Ignored columns whose header is too long or too volatile to pin down exactly
 * -- the payment question embeds account handles and line breaks.
 */
const IGNORED_PATTERNS: RegExp[] = [/paypal|venmo/];

/** Exact header matches, keyed by normalised form. Checked before the patterns. */
const EXACT: Record<string, CsvField> = {
  ciserfirstname: 'first_name',
  ciserlastname: 'last_name',
  dob: 'dob',
  gender: 'gender',
  grade: 'grade',
  homeaddress: 'home_address',
  youthemail: 'kid_email',
  youthphonenumber: 'kid_phone',
  youthtshirtsize: 'tshirt_size',
  forambassadorsonlypickyourtop4onlycissports: 'top_sports_ambassadors',
  forjuniorsonlypickyourtop4onlycissports: 'top_sports_juniors',
  parentguardian: 'guardian_name',
  parentguardianphonenumber: 'guardian_phone',
  parentguardianemail: 'guardian_email',
  emergencycontactname: 'emergency_contact_name',
  emergencycontactnumber: 'emergency_contact_phone',
  haveyoufilledoutaconsentform: 'consent_claim',
  pleaseusethebelowlinkfortheparentsconsentform: 'consent_method',
  '7thgradeonlypleasechoosewhichsessionyoudliketoattend': 'division_choice',
};

/**
 * Fallback patterns, most specific first -- the order matters, since
 * "parent guardian email" would otherwise be caught by the bare /email/ rule.
 */
const PATTERNS: [RegExp, CsvField][] = [
  // Checked before the generic sports rules: these headers contain both a
  // division name and "sports", and the division is what distinguishes them.
  [/ambassador.*sport/, 'top_sports_ambassadors'],
  [/junior.*sport/, 'top_sports_juniors'],
  // Before the bare /consentform/ rule, which would otherwise take both.
  [/(haveyou|filledout|completed).*consentform/, 'consent_claim'],
  [/consentform/, 'consent_method'],
  [/session|division|juniorsorambassadors/, 'division_choice'],
  [/tshirt|shirtsize/, 'tshirt_size'],
  [/allerg|medical/, 'allergies'],
  [/(top|favorite|preferred).*sport|sportspreference/, 'top_sports_ambassadors'],
  [/emergency.*(name)/, 'emergency_contact_name'],
  [/emergency.*(number|phone|cell)/, 'emergency_contact_phone'],
  [/(parent|guardian).*(email)/, 'guardian_email'],
  [/(parent|guardian).*(phone|number|cell)/, 'guardian_phone'],
  [/(parent|guardian)/, 'guardian_name'],
  [/youth.*(email)/, 'kid_email'],
  [/youth.*(phone|number|cell)/, 'kid_phone'],
  [/(first|given).*(name)/, 'first_name'],
  [/(last|sur).*(name)/, 'last_name'],
  [/(dob|dateofbirth|birthdate|birthday)/, 'dob'],
  [/(homeaddress|address|street)/, 'home_address'],
  [/grade/, 'grade'],
  [/gender/, 'gender'],
];

/**
 * Fields without which a row cannot produce a `Kid` + `Registration` at all.
 *
 * These back NOT NULL columns with no derivable default. `division_choice` is
 * absent on purpose: division is normally derived from grade, and is only
 * required for 7th graders (handled per-row, not per-file). `allergies`, the
 * two top-sports columns, `kid_email` and `kid_phone` are all optional -- and
 * the real export has no allergies question at all.
 *
 * The form's photo question is deliberately unmapped: kid photos were dropped
 * on 2026-09-23 (see docs/decisions.md), so that column is reported as
 * unrecognised like any other column the importer does not use.
 */
export const REQUIRED_FIELDS: readonly CsvField[] = [
  'first_name',
  'last_name',
  'dob',
  'gender',
  'home_address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'guardian_name',
  'guardian_phone',
  'guardian_email',
  'grade',
  'tshirt_size',
] as const;

export interface HeaderMapping {
  /** Field -> column index in the CSV row. */
  columnOf: Partial<Record<CsvField, number>>;
  /** Field -> that column's header text, verbatim, for error messages. */
  headerOf: Partial<Record<CsvField, string>>;
  /** Headers deliberately skipped (timestamp and the like). */
  ignored: string[];
  /** Headers that matched nothing -- surfaced to the Admin, not silently dropped. */
  unmapped: string[];
  /** Required fields with no column at all; a file-level problem, not a row one. */
  missingRequired: CsvField[];
}

/** Lower-cases and strips everything but letters and digits. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves each header to a field.
 *
 * First match wins per field: if two columns both look like the same field, the
 * earlier one is used and the later is reported as unmapped rather than silently
 * overwriting it.
 */
export function mapHeaders(headers: string[]): HeaderMapping {
  const columnOf: Partial<Record<CsvField, number>> = {};
  const headerOf: Partial<Record<CsvField, string>> = {};
  const ignored: string[] = [];
  const unmapped: string[] = [];

  headers.forEach((raw, index) => {
    const key = normalizeHeader(raw);
    if (key === '') return;

    if (IGNORED_HEADERS.has(key) || IGNORED_PATTERNS.some((p) => p.test(key))) {
      ignored.push(raw);
      return;
    }

    const field = EXACT[key] ?? PATTERNS.find(([pattern]) => pattern.test(key))?.[1];

    if (field === undefined || columnOf[field] !== undefined) {
      unmapped.push(raw);
      return;
    }

    columnOf[field] = index;
    headerOf[field] = raw;
  });

  const missingRequired = REQUIRED_FIELDS.filter((f) => columnOf[f] === undefined);

  return { columnOf, headerOf, ignored, unmapped, missingRequired };
}

/** The CSV's own header for a field, falling back to a readable label. */
export function headerFor(mapping: HeaderMapping, field: CsvField): string {
  return mapping.headerOf[field] ?? FIELD_LABEL[field];
}
