import { mapHeaders } from './columns';
import {
  cleanCell,
  parseDate,
  normalizePhone,
  parseGender,
  parseTshirtSize,
  parseDivisionChoice,
  parseList,
  parseConsentClaim,
  parseRow,
  parseRows,
  identityKey,
} from './rows';

/** Verbatim from a real export, stray spaces and colons included. */
const HEADERS = [
  'Timestamp',
  'CISer First Name',
  'CISer Last Name ',
  'DOB',
  'Gender',
  'Grade',
  'Youth tshirt size',
  'Home Address',
  'Emergency Contact Name:',
  'Emergency contact Number:',
  'Parent/Guardian ',
  'Parent/Guardian Phone number',
  'Parent/Guardian email:',
  'Youth email:',
  'Youth phone number:',
  "7th Grade ONLY - Please choose which session you'd like to attend.",
  'For AMBASSADORS ONLY - Pick your TOP 4 ONLY CIS Sports',
  'For JUNIORS ONLY - Pick your TOP 4 ONLY CIS Sports',
];

const CHOICE = "7th Grade ONLY - Please choose which session you'd like to attend.";
const AMB_SPORTS = 'For AMBASSADORS ONLY - Pick your TOP 4 ONLY CIS Sports';
const JUN_SPORTS = 'For JUNIORS ONLY - Pick your TOP 4 ONLY CIS Sports';

const mapping = mapHeaders(HEADERS);

/**
 * A row that should import cleanly, using the real export's value formats
 * (M/D/YYYY dates, "Male", bare enum t-shirt codes). Synthetic data only --
 * the real file contains minors' details and is never committed.
 */
function row(overrides: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    Timestamp: '9/1/2026 10:04:11',
    'CISer First Name': 'Mina',
    'CISer Last Name ': 'Hanna',
    DOB: '3/5/2014',
    Gender: 'Male',
    Grade: '5',
    'Youth tshirt size': 'YM',
    'Home Address': '1 Main St, Hayward CA',
    'Emergency Contact Name:': 'Sara Hanna',
    'Emergency contact Number:': '5105551234',
    'Parent/Guardian ': 'Sara Hanna',
    'Parent/Guardian Phone number': '510-555-1234',
    'Parent/Guardian email:': 'sara@example.com',
    'Youth email:': '',
    'Youth phone number:': '',
    [CHOICE]: '',
    [AMB_SPORTS]: '',
    [JUN_SPORTS]: '',
  };
  return HEADERS.map((h) => ({ ...base, ...overrides })[h] ?? '');
}

describe('cleanCell', () => {
  it.each(['', '   ', '-', '--', 'N/A', 'n/a', 'none', 'NULL'])(
    'treats %p as no answer',
    (value) => expect(cleanCell(value)).toBeNull(),
  );

  it('trims but keeps real values', () => {
    expect(cleanCell('  Hayward  ')).toBe('Hayward');
  });

  it('handles null and undefined cells', () => {
    expect(cleanCell(null)).toBeNull();
    expect(cleanCell(undefined)).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses the M/D/YYYY that Google Forms produces', () => {
    expect(parseDate('3/5/2014')).toBe('2014-03-05');
    expect(parseDate('12/25/2010')).toBe('2010-12-25');
  });

  it('parses ISO and dot or dash separators', () => {
    expect(parseDate('2014-03-05')).toBe('2014-03-05');
    expect(parseDate('3-5-2014')).toBe('2014-03-05');
    expect(parseDate('3.5.2014')).toBe('2014-03-05');
  });

  it('reads a 2-digit year as this century for a school-age kid', () => {
    expect(parseDate('3/5/14')).toBe('2014-03-05');
  });

  // Guards against `new Date()` quietly rolling 2/30 over into March.
  it('rejects a date that does not exist', () => {
    expect(parseDate('2/30/2015')).toBeNull();
    expect(parseDate('13/1/2015')).toBeNull();
    expect(parseDate('2015-02-30')).toBeNull();
  });

  it('returns null for unparseable text so the raw value can be reported back', () => {
    expect(parseDate('sometime in March')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('formats a 10-digit number consistently however it was typed', () => {
    expect(normalizePhone('5105551234')).toBe('(510) 555-1234');
    expect(normalizePhone('510-555-1234')).toBe('(510) 555-1234');
    expect(normalizePhone('(510) 555 1234')).toBe('(510) 555-1234');
  });

  it('strips a leading country code', () => {
    expect(normalizePhone('1-510-555-1234')).toBe('(510) 555-1234');
  });

  // These reach a parent in an emergency; an odd format must never be dropped.
  it('passes through anything it does not recognise, rather than discarding it', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(normalizePhone('ask at front desk')).toBe('ask at front desk');
  });

  it('returns null for a blank cell', () => {
    expect(normalizePhone('  ')).toBeNull();
  });
});

describe('value coercion', () => {
  it('lower-cases gender to match the stored enum', () => {
    expect(parseGender('Male')).toBe('male');
    expect(parseGender('FEMALE')).toBe('female');
  });

  it.each([
    ['YM', 'YM'],
    ['ym', 'YM'],
    ['Youth Medium', 'YM'],
    ['Extra Large', 'XL'],
    ['Small', 'S'],
  ])('resolves t-shirt size %p to %p', (input, expected) => {
    expect(parseTshirtSize(input)).toBe(expected);
  });

  // Passed through as typed (bar casing) so the schema rejects it and the Admin
  // sees a size they recognise as their own, rather than a mangled version.
  it('leaves an unrecognised size alone for the schema to reject', () => {
    expect(parseTshirtSize('Adult Large')).toBe('ADULT LARGE');
  });

  it('reads the 7th-grade division choice from free text', () => {
    expect(parseDivisionChoice('Ambassadors')).toBe('ambassadors');
    expect(parseDivisionChoice("I'd like Juniors please")).toBe('juniors');
    expect(parseDivisionChoice('not sure')).toBeNull();
    expect(parseDivisionChoice('')).toBeNull();
  });

  it('splits a multi-select answer', () => {
    expect(parseList('Soccer, Basketball')).toEqual(['Soccer', 'Basketball']);
    expect(parseList('Soccer')).toEqual(['Soccer']);
    expect(parseList(' , ')).toBeNull();
    expect(parseList('')).toBeNull();
  });
});

describe('parseRow', () => {
  it('turns a well-formed row into a kid and a registration', () => {
    const result = parseRow(row(), mapping, 2);

    expect(result.errors).toEqual([]);
    expect(result.data?.kid).toMatchObject({
      first_name: 'Mina',
      last_name: 'Hanna',
      dob: '2014-03-05',
      gender: 'male',
      guardian_phone: '(510) 555-1234',
      email: null,
      phone: null,
    });
    expect(result.data?.registration).toMatchObject({
      grade: 5,
      division: 'juniors',
      tshirt_size: 'YM',
    });
  });

  it('derives division from grade when the choice column is blank', () => {
    expect(parseRow(row({ Grade: '9' }), mapping, 2).data?.registration.division)
      .toBe('ambassadors');
  });

  it('honours the 7th-grade choice', () => {
    expect(parseRow(row({ Grade: '7', [CHOICE]: "Ambassadors' Session 2:30 - 4:30 PM" }), mapping, 2)
      .data?.registration.division).toBe('ambassadors');
    expect(parseRow(row({ Grade: '7', [CHOICE]: 'Juniors Session 12:30 - 2:30 PM' }), mapping, 2)
      .data?.registration.division).toBe('juniors');
  });

  it('fails a 7th grader who chose nothing, pointing at the choice column', () => {
    const result = parseRow(row({ Grade: '7' }), mapping, 4);
    expect(result.data).toBeNull();
    expect(result.errors).toEqual([
      {
        row: 4,
        column: CHOICE,
        field: 'division_choice',
        message: 'Division must be Juniors or Ambassadors',
      },
    ]);
  });

  it('reports which row, which column and why', () => {
    const result = parseRow(row({ 'Parent/Guardian email:': 'nope' }), mapping, 14);

    expect(result.data).toBeNull();
    expect(result.errors).toEqual([
      {
        row: 14,
        column: 'Parent/Guardian email:',
        field: 'guardian_email',
        message: 'Parent/guardian email is not a valid email address',
      },
    ]);
  });

  it('names the CSV header, not the schema field name', () => {
    const result = parseRow(row({ DOB: 'last spring' }), mapping, 7);
    expect(result.errors[0].column).toBe('DOB');
  });

  it('reports a grade/division mismatch against the choice column', () => {
    const result = parseRow(row({ Grade: '5', [CHOICE]: 'Ambassadors' }), mapping, 3);

    expect(result.errors).toEqual([
      {
        row: 3,
        column: CHOICE,
        field: 'division_choice',
        message: 'Grade 5 must be registered as juniors',
      },
    ]);
  });

  it('collects every problem in a row, not just the first', () => {
    const result = parseRow(
      row({ 'CISer First Name': '', DOB: 'nope', 'Youth tshirt size': 'XXXL' }),
      mapping,
      5,
    );
    expect(result.errors.map((e) => e.field).sort()).toEqual(['dob', 'first_name', 'tshirt_size']);
  });

  it('keeps an optional field blank without complaint', () => {
    const result = parseRow(row({ 'Youth email:': 'n/a', 'Youth phone number:': '-' }), mapping, 2);
    expect(result.errors).toEqual([]);
    expect(result.data?.kid.email).toBeNull();
  });

  // Kid photos were dropped on 2026-09-23 (docs/decisions.md). A file the
  // Admin exports still carries the question, so the extra column must be
  // harmless rather than blowing the row up.
  it('ignores the form photo column without disturbing the row', () => {
    const withPhoto = mapHeaders([...HEADERS, 'Please upload a picture/selfie of the CISer']);
    const cells = [...row(), 'https://drive.google.com/file/d/abc/view'];
    const result = parseRow(cells, withPhoto, 2);

    expect(result.errors).toEqual([]);
    expect(result.data?.kid.first_name).toBe('Mina');
  });
});

/**
 * The form asks for top sports twice, once per division, and the real export
 * shows kids do not stick to the one meant for them: 11 of 149 filled both, and
 * 10 filled only the column for the other division.
 */
describe('parseRow top sports', () => {
  const sports = 'Basketball, Dodgeball, Soccer, Volleyball';

  it('reads the column matching the division the kid is registering in', () => {
    const juniors = parseRow(row({ Grade: '5', [JUN_SPORTS]: sports }), mapping, 2);
    expect(juniors.data?.registration.top_sports)
      .toEqual(['Basketball', 'Dodgeball', 'Soccer', 'Volleyball']);

    const ambassadors = parseRow(row({ Grade: '9', [AMB_SPORTS]: sports }), mapping, 2);
    expect(ambassadors.data?.registration.top_sports).toHaveLength(4);
  });

  it('prefers the matching column when a kid filled in both', () => {
    const result = parseRow(
      row({ Grade: '5', [JUN_SPORTS]: 'Soccer', [AMB_SPORTS]: 'Volleyball' }),
      mapping,
      2,
    );
    expect(result.data?.registration.top_sports).toEqual(['Soccer']);
  });

  it('falls back to the other column rather than dropping a stated preference', () => {
    // A grade 5 kid who answered only the Ambassadors question.
    const result = parseRow(row({ Grade: '5', [AMB_SPORTS]: 'Volleyball' }), mapping, 2);
    expect(result.data?.registration.top_sports).toEqual(['Volleyball']);
  });

  it('is null when neither column was answered', () => {
    expect(parseRow(row({ Grade: '5' }), mapping, 2).data?.registration.top_sports).toBeNull();
  });
});

/**
 * Consent is read for the Admin's review screen only. It never reaches
 * `consent_given_at`, which stays null on import (docs/decisions.md 2026-09-22).
 */
describe('consent claim', () => {
  const YES = 'Yes, I attended camp last September/October and submitted a completed consent form.';
  const NO = 'No, I will use the link provided below to submit one.';
  const DONE = 'I have already submitted one for camp this summer 2025.';
  const LATER = 'I will submit form with cash payment to Admin team member: Maria Meawad';
  const EMAIL_LATER = 'I will print, sign and email form to CISSTANTONIOS@GMAIL.COM';

  it('reports a claim only when both questions agree', () => {
    expect(parseConsentClaim(YES, DONE)).toBe('claimed');
  });

  it('reports no claim when the parent says they still owe one', () => {
    expect(parseConsentClaim(NO, LATER)).toBe('not-claimed');
    expect(parseConsentClaim(NO, EMAIL_LATER)).toBe('not-claimed');
  });

  // 21 of the 117 "Yes" rows in the real export did exactly this. Taking the
  // "Yes" at face value would mark them as covered when the parent said
  // otherwise one question later.
  it('flags a Yes that is contradicted by the follow-up as inconsistent', () => {
    expect(parseConsentClaim(YES, LATER)).toBe('inconsistent');
    expect(parseConsentClaim(YES, EMAIL_LATER)).toBe('inconsistent');
  });

  it('flags a No that is contradicted by the follow-up as inconsistent', () => {
    expect(parseConsentClaim(NO, DONE)).toBe('inconsistent');
  });

  // The "how" question is a multi-select: 10 rows in the real export ticked
  // mutually exclusive options together.
  it('flags a self-contradictory multi-select answer', () => {
    expect(parseConsentClaim(YES, `${LATER}, ${DONE}`)).toBe('inconsistent');
    expect(parseConsentClaim(NO, `${LATER}, ${DONE}`)).toBe('inconsistent');
    expect(parseConsentClaim('', `${LATER}, ${DONE}`)).toBe('inconsistent');
  });

  it('accepts a multi-select of several compatible options', () => {
    expect(parseConsentClaim(NO, `${LATER}, ${EMAIL_LATER}`)).toBe('not-claimed');
  });

  it('falls back to whichever question was answered', () => {
    expect(parseConsentClaim(YES, '')).toBe('claimed');
    expect(parseConsentClaim('', DONE)).toBe('claimed');
    expect(parseConsentClaim('', LATER)).toBe('not-claimed');
  });

  it('is unknown when neither column is present', () => {
    expect(parseConsentClaim(null, null)).toBe('unknown');
    expect(parseConsentClaim('', '')).toBe('unknown');
  });

  it('is surfaced on the parsed row but never written to the registration', () => {
    const withConsent = mapHeaders([...HEADERS, 'Have you filled out a consent form?']);
    const result = parseRow([...row(), YES], withConsent, 2);

    expect(result.consentClaim).toBe('claimed');
    // consent_given_at is not part of the validated shape at all.
    expect(result.data?.registration).not.toHaveProperty('consent_given_at');
  });

  it('is unknown when the export has no consent columns', () => {
    expect(parseRow(row(), mapping, 2).consentClaim).toBe('unknown');
  });
});

describe('parseRows', () => {
  it('numbers rows from 2, counting the header as line 1', () => {
    const results = parseRows([row(), row({ Grade: '8' })], mapping);
    expect(results.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it('keeps good rows alongside bad ones', () => {
    const results = parseRows([row(), row({ Gender: 'unknown' })], mapping);
    expect(results[0].data).not.toBeNull();
    expect(results[1].data).toBeNull();
  });
});

describe('identityKey', () => {
  const kid = { first_name: 'Mina', last_name: 'Hanna', dob: '2014-03-05' };

  it('ignores case and surrounding whitespace, matching the database index', () => {
    expect(identityKey({ first_name: '  mina ', last_name: 'HANNA', dob: '2014-03-05' }))
      .toBe(identityKey(kid));
  });

  it('separates kids who share a name but not a birthday', () => {
    expect(identityKey({ ...kid, dob: '2015-03-05' })).not.toBe(identityKey(kid));
  });

  it('separates different names', () => {
    expect(identityKey({ ...kid, last_name: 'Guirguis' })).not.toBe(identityKey(kid));
  });

  // Twins share a surname and a birthday but not a first name, so they do NOT
  // collide -- contrary to the claim in the migration's comment.
  it('does not collide for twins, who differ by first name', () => {
    expect(identityKey({ first_name: 'Mina', last_name: 'Hanna', dob: '2014-03-05' }))
      .not.toBe(identityKey({ first_name: 'Marina', last_name: 'Hanna', dob: '2014-03-05' }));
  });

  // What actually repeats is a resubmission: the real 2026-27 export contains
  // 5 such pairs. This is why the database index is non-unique and why the
  // importer must collapse or flag duplicates instead of picking one.
  it('collides for a repeat submission of the same kid', () => {
    expect(identityKey({ first_name: 'Mina', last_name: 'Hanna', dob: '2014-03-05' }))
      .toBe(identityKey({ first_name: 'Mina ', last_name: 'hanna', dob: '2014-03-05' }));
  });
});
