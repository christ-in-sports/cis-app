/**
 * Turns one raw CSV row into a validated `Kid` + `Registration`, or into
 * row-level errors naming the offending column.
 *
 * The split of responsibility is deliberate: everything in here is about
 * *spreadsheet shape* -- blank cells, "N/A", M/D/YYYY dates, "Male" vs "male",
 * a division that has to be inferred from grade. The rules about what a valid
 * registration actually is live in `src/lib/validation/kid.ts` and are shared
 * with the parent form (ENG-4). This module coerces, then delegates.
 *
 * Errors are reported per row and per column (`project_spec.md` §2.5) rather
 * than as a single file-level pass/fail, because the Admin has to be able to
 * find and fix the bad cell in their spreadsheet.
 */

import { gradeNum, defaultDivision, type Division } from '@/lib/attendance';
import { kidRegistrationSchema, type KidRegistrationInput } from '@/lib/validation/kid';
import { headerFor, type CsvField, type HeaderMapping } from './columns';

/** Cell values that mean "no answer" rather than a literal value. */
const BLANK_VALUES = new Set(['', '-', '--', 'n/a', 'na', 'none', 'null']);

export interface RowError {
  /** 1-based line number in the source file, counting the header as line 1. */
  row: number;
  /** The CSV column header, or null for a whole-row problem. */
  column: string | null;
  field: CsvField | null;
  message: string;
}

/**
 * What the form says about parental consent, for the Admin's review screen.
 *
 * - `claimed`      both questions agree that a form was already submitted
 * - `not-claimed`  the parent says they still have to submit one
 * - `inconsistent` the two questions contradict each other
 * - `unknown`      the columns are absent or blank
 */
export type ConsentClaim = 'claimed' | 'not-claimed' | 'inconsistent' | 'unknown';

export interface ParsedRow {
  rowNumber: number;
  /** Null when the row failed validation. */
  data: KidRegistrationInput | null;
  errors: RowError[];
  /**
   * Self-reported consent status. Deliberately kept OUT of `data`: it never
   * reaches `consent_given_at`, which stays null on import
   * (`docs/decisions.md`, 2026-09-22). It exists so the review screen can show
   * the Admin who still owes a paper form.
   */
  consentClaim: ConsentClaim;
}

/** Trims a cell and collapses "no answer" spellings to null. */
export function cleanCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return BLANK_VALUES.has(text.toLowerCase()) ? null : text;
}

/**
 * Parses the date spellings a Google Forms export produces into `YYYY-MM-DD`.
 *
 * Accepts `M/D/YYYY` (the common case), `YYYY-MM-DD`, and dot/dash separators.
 * Returns null on anything else so the caller can report the raw text back to
 * the Admin, rather than guessing and importing a wrong birthday.
 *
 * Real-date checking matters here: `2/30/2015` parses structurally but is not a
 * date, and `new Date()` would silently roll it over to March 2nd.
 */
export function parseDate(value: unknown): string | null {
  const text = cleanCell(value);
  if (text === null) return null;

  let year: number;
  let month: number;
  let day: number;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3]);

    // A 2-digit year is ambiguous. Registrants are in grades 4-12, so a
    // birth year in the 2000s is overwhelmingly more likely than the 1900s;
    // pivot at the current century's two-digit year.
    if (us[3].length === 2) {
      const pivot = new Date().getFullYear() % 100;
      year += year <= pivot ? 2000 : 1900;
    }
  } else {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;

  if (!isRealDate) return null;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalises a phone number for display consistency.
 *
 * Anything that is not recognisably a 10-digit US number is passed through as
 * typed -- these are contact details for reaching a parent in an emergency, so
 * an unusual format must never be discarded.
 */
export function normalizePhone(value: unknown): string | null {
  const text = cleanCell(value);
  if (text === null) return null;

  const digits = text.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (local.length !== 10) return text;

  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** Lower-cases gender so "Male" from the form matches the stored enum. */
export function parseGender(value: unknown): string | null {
  const text = cleanCell(value);
  return text === null ? null : text.toLowerCase();
}

/**
 * Resolves a t-shirt size to the stored enum.
 *
 * Handles the bare codes plus the spelled-out forms a dropdown tends to use.
 * Unrecognised input is returned as typed so the schema reports it against the
 * t-shirt column, listing the valid sizes.
 */
export function parseTshirtSize(value: unknown): string | null {
  const text = cleanCell(value);
  if (text === null) return null;

  const key = text.toLowerCase().replace(/[^a-z]/g, '');

  const spelled: Record<string, string> = {
    youthsmall: 'YS',
    youthmedium: 'YM',
    youthlarge: 'YL',
    extrasmall: 'XS',
    small: 'S',
    medium: 'M',
    large: 'L',
    extralarge: 'XL',
    doubleextralarge: 'XXL',
    extraextralarge: 'XXL',
  };

  if (spelled[key] !== undefined) return spelled[key];

  return text.trim().toUpperCase();
}

/**
 * Reads the 7th-grade division choice.
 *
 * The form asks this as free-ish text ("Juniors", "I'd like Ambassadors"), so
 * it is matched by substring rather than equality.
 */
export function parseDivisionChoice(value: unknown): Division | null {
  const text = cleanCell(value);
  if (text === null) return null;

  const lowered = text.toLowerCase();
  if (lowered.includes('ambassador')) return 'ambassadors';
  if (lowered.includes('junior')) return 'juniors';
  return null;
}

/**
 * Reads the two consent questions together.
 *
 * They are cross-checked rather than taken at face value because they disagree
 * often: in the 2026-27 export, 21 of the 117 rows answering "Yes, I already
 * submitted a consent form" went on to say in the next question that they would
 * submit one later, and 4 did the reverse. Reporting a bare "Yes" would tell an
 * Admin 21 kids were covered when the parent themselves indicated otherwise.
 *
 * This never produces a `consent_given_at`. The "Yes" wording refers to a paper
 * form handed in months earlier ("I attended camp last September/October"), so
 * the only timestamp the CSV offers -- when the registration form was filled in
 * -- is not when consent was given.
 */
export function parseConsentClaim(
  claim: unknown,
  method: unknown,
): ConsentClaim {
  const said = cleanCell(claim)?.toLowerCase() ?? null;
  const how = cleanCell(method)?.toLowerCase() ?? null;

  // The "how" question is a multi-select, so its answer can contain several
  // options at once -- including mutually exclusive ones. Both signals are
  // therefore read independently rather than as a single either/or.
  const saysDone = how !== null && how.includes('already submitted');
  const saysLater =
    how !== null && (how.includes('will submit') || how.includes('will print'));

  // Ticked "already submitted" AND "will submit later" in the same answer.
  if (saysDone && saysLater) return 'inconsistent';

  const fromMethod: ConsentClaim | null = saysDone
    ? 'claimed'
    : saysLater
      ? 'not-claimed'
      : null;

  const fromClaim: ConsentClaim | null =
    said === null ? null : said.startsWith('yes') ? 'claimed' : 'not-claimed';

  if (fromClaim === null && fromMethod === null) return 'unknown';
  if (fromClaim === null) return fromMethod!;
  if (fromMethod === null) return fromClaim;

  return fromClaim === fromMethod ? fromClaim : 'inconsistent';
}

/** Splits a multi-select answer ("Soccer, Basketball") into its options. */
export function parseList(value: unknown): string[] | null {
  const text = cleanCell(value);
  if (text === null) return null;

  const items = text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

  return items.length === 0 ? null : items;
}

/**
 * Maps a validation issue's path back to the CSV column that produced it, so an
 * error can say "row 14, column Grade" instead of "registration.grade".
 *
 * `skill_tags` has no column -- nothing in the form collects it -- so an issue
 * there is reported without one.
 */
const FIELD_OF_PATH: Record<string, CsvField> = {
  'kid.first_name': 'first_name',
  'kid.last_name': 'last_name',
  'kid.dob': 'dob',
  'kid.gender': 'gender',
  'kid.email': 'kid_email',
  'kid.phone': 'kid_phone',
  'kid.allergies': 'allergies',
  'kid.home_address': 'home_address',
  'kid.emergency_contact_name': 'emergency_contact_name',
  'kid.emergency_contact_phone': 'emergency_contact_phone',
  'kid.guardian_name': 'guardian_name',
  'kid.guardian_phone': 'guardian_phone',
  'kid.guardian_email': 'guardian_email',
  'kid.photo_path': 'photo_link',
  'registration.grade': 'grade',
  // Division is never read straight from a column -- it is either derived from
  // grade or taken from the 7th-grade choice -- so that choice column is what
  // an Admin would edit to fix it.
  'registration.division': 'division_choice',
  'registration.tshirt_size': 'tshirt_size',
  // Merged from two columns; name the Ambassadors one, which is the more
  // commonly filled of the pair.
  'registration.top_sports': 'top_sports_ambassadors',
};

/**
 * Builds the loosely-typed candidate object for one row.
 *
 * Everything stays `unknown`-ish here on purpose: coercion fixes *shape*, and
 * the schema decides what is acceptable. Pre-rejecting values in this function
 * would move rules out of the shared schema and let the CSV path and the parent
 * form drift apart.
 */
function buildCandidate(cells: string[], mapping: HeaderMapping) {
  const cell = (field: CsvField): string | null => {
    const index = mapping.columnOf[field];
    return index === undefined ? null : cleanCell(cells[index]);
  };

  const grade = gradeNum(cell('grade'));
  const division = parseDivisionChoice(cell('division_choice')) ?? defaultDivision(grade);

  // The form asks for top sports twice, once per division, and kids do not
  // reliably answer only the one meant for them: in the 2026-27 export, 11
  // filled both and 10 filled only the column for the other division. Prefer
  // the answer for the division they are actually registering in, but fall back
  // to the other rather than discarding a preference they did express.
  const ambassadorsSports = cell('top_sports_ambassadors');
  const juniorsSports = cell('top_sports_juniors');
  const ownDivisionSports =
    division === 'ambassadors'
      ? ambassadorsSports
      : division === 'juniors'
        ? juniorsSports
        : null;

  return {
    kid: {
      first_name: cell('first_name'),
      last_name: cell('last_name'),
      dob: parseDate(cell('dob')),
      gender: parseGender(cell('gender')),
      photo_path: null, // Drive links are fetched in a later PR; never the raw URL.
      email: cell('kid_email'),
      phone: normalizePhone(cell('kid_phone')),
      allergies: cell('allergies'),
      home_address: cell('home_address'),
      emergency_contact_name: cell('emergency_contact_name'),
      emergency_contact_phone: normalizePhone(cell('emergency_contact_phone')),
      guardian_name: cell('guardian_name'),
      guardian_phone: normalizePhone(cell('guardian_phone')),
      guardian_email: cell('guardian_email'),
      skill_tags: [],
    },
    registration: {
      grade,
      division,
      tshirt_size: parseTshirtSize(cell('tshirt_size')),
      top_sports: parseList(ownDivisionSports ?? ambassadorsSports ?? juniorsSports),
    },
  };
}

/**
 * Validates one row.
 *
 * `rowNumber` is the line in the file the Admin opened, so it counts the header
 * as line 1 and the first data row as line 2.
 */
export function parseRow(
  cells: string[],
  mapping: HeaderMapping,
  rowNumber: number,
): ParsedRow {
  const at = (field: CsvField): string | null => {
    const index = mapping.columnOf[field];
    return index === undefined ? null : (cells[index] ?? null);
  };

  const consentClaim = parseConsentClaim(at('consent_claim'), at('consent_method'));
  const result = kidRegistrationSchema.safeParse(buildCandidate(cells, mapping));

  if (result.success) {
    return { rowNumber, data: result.data, errors: [], consentClaim };
  }

  const errors = result.error.issues.map((issue): RowError => {
    const field = FIELD_OF_PATH[issue.path.join('.')] ?? null;
    return {
      row: rowNumber,
      column: field === null ? null : headerFor(mapping, field),
      field,
      message: issue.message,
    };
  });

  return { rowNumber, data: null, errors, consentClaim };
}

/** Validates every data row. `rows` excludes the header. */
export function parseRows(rows: string[][], mapping: HeaderMapping): ParsedRow[] {
  return rows.map((cells, index) => parseRow(cells, mapping, index + 2));
}

/**
 * The returning-kid matching key: first name + last name + DOB, case-insensitive
 * and whitespace-trimmed (`project_spec.md` §2.5).
 *
 * Mirrors the `kids_identity_idx` expression index so the importer's in-memory
 * duplicate detection and the database's lookup agree.
 *
 * That index is deliberately non-unique, and the real export shows why: it
 * contains 5 pairs of rows sharing a key, which look like repeat submissions of
 * the same kid (same gender, grade and usually address, different timestamps)
 * rather than distinct people. A unique constraint would abort an entire
 * import on data the Admin considers ordinary.
 *
 * Note this key does NOT collide for twins -- they share a surname and a
 * birthday but not a first name. The migration's comment claims otherwise; it
 * reaches the right design for the wrong reason. Corrected there separately.
 *
 * Because a key can legitimately repeat, the importer must never silently pick
 * one match: within a file, duplicates need collapsing or flagging, and against
 * the database, more than one match is a row-level error for an Admin.
 */
export function identityKey(kid: {
  first_name: string;
  last_name: string;
  dob: string;
}): string {
  return [
    kid.first_name.trim().toLowerCase(),
    kid.last_name.trim().toLowerCase(),
    kid.dob,
  ].join('|');
}
