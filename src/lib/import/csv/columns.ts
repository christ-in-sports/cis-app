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
 * !! The header table below is derived from the previous importer's mapping
 * (removed in 5ae28fb) plus the fields ENG-5 adds. It has NOT been checked
 * against a real export -- the ticket's "Pre-development data needed" section
 * asks the Admin for a sample roster CSV, which has not been supplied. Expect
 * to correct these once real data lands; `unmapped` on the result exists so the
 * review screen can show an Admin exactly which of their columns were not
 * understood rather than failing silently.
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
  | 'photo_link'
  | 'grade'
  | 'division_choice'
  | 'tshirt_size'
  | 'top_sports';

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
  photo_link: 'Picture or selfie of CISer',
  grade: 'Grade',
  division_choice: 'Session choice (7th grade only)',
  tshirt_size: 'Youth t-shirt size',
  top_sports: 'Top sports',
};

/**
 * Columns that exist in the export but hold nothing the schema wants.
 *
 * `emailaddress` is Google Forms' automatic respondent field. The previous
 * importer read it as the *kid's* email, which looks wrong: the respondent is
 * the parent filling the form in, and the parent's address already has its own
 * question (`parentguardianemail`). It is ignored here rather than guessed at
 * -- flagged for confirmation against a real export.
 */
const IGNORED_HEADERS = new Set(['timestamp', 'emailaddress']);

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
  pictureorselfieofciser: 'photo_link',
  parentguardian: 'guardian_name',
  parentguardianphonenumber: 'guardian_phone',
  parentguardianemail: 'guardian_email',
  emergencycontactname: 'emergency_contact_name',
  emergencycontactnumber: 'emergency_contact_phone',
  '7thgradeonlypleasechoosewhichsessionyoudliketoattend': 'division_choice',
};

/**
 * Fallback patterns, most specific first -- the order matters, since
 * "parent guardian email" would otherwise be caught by the bare /email/ rule.
 */
const PATTERNS: [RegExp, CsvField][] = [
  [/session|division|juniorsorambassadors/, 'division_choice'],
  [/tshirt|shirtsize/, 'tshirt_size'],
  [/(picture|photo|selfie|headshot)/, 'photo_link'],
  [/allerg|medical/, 'allergies'],
  [/(top|favorite|preferred).*sport|sportspreference/, 'top_sports'],
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
 * required for 7th graders (handled per-row, not per-file). `allergies`,
 * `top_sports`, `kid_email`, `kid_phone` and `photo_link` are all optional.
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

    if (IGNORED_HEADERS.has(key)) {
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
