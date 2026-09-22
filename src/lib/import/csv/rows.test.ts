import { mapHeaders } from './columns';
import {
  cleanCell,
  parseDate,
  normalizePhone,
  parseGender,
  parseTshirtSize,
  parseDivisionChoice,
  parseList,
  parseRow,
  parseRows,
  identityKey,
} from './rows';

const HEADERS = [
  'Timestamp',
  'CISer First Name',
  'CISer Last Name',
  'DOB',
  'Gender',
  'Grade',
  'Youth T-Shirt Size',
  'Home Address',
  'Emergency Contact Name',
  'Emergency Contact Number',
  'Parent/Guardian',
  'Parent/Guardian Phone Number',
  'Parent/Guardian Email',
  'Youth Email',
  'Youth Phone Number',
  "7th Grade ONLY - Please choose which session you'd like to attend",
];

const mapping = mapHeaders(HEADERS);

/** A row that should import cleanly. Overrides are applied by column header. */
function row(overrides: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    Timestamp: '9/1/2026 10:04:11',
    'CISer First Name': 'Mina',
    'CISer Last Name': 'Hanna',
    DOB: '3/5/2014',
    Gender: 'Male',
    Grade: '5',
    'Youth T-Shirt Size': 'YM',
    'Home Address': '1 Main St, Hayward CA',
    'Emergency Contact Name': 'Sara Hanna',
    'Emergency Contact Number': '5105551234',
    'Parent/Guardian': 'Sara Hanna',
    'Parent/Guardian Phone Number': '510-555-1234',
    'Parent/Guardian Email': 'sara@example.com',
    'Youth Email': '',
    'Youth Phone Number': '',
    "7th Grade ONLY - Please choose which session you'd like to attend": '',
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
    const choice = "7th Grade ONLY - Please choose which session you'd like to attend";
    expect(parseRow(row({ Grade: '7', [choice]: 'Ambassadors' }), mapping, 2).data?.registration.division)
      .toBe('ambassadors');
    expect(parseRow(row({ Grade: '7', [choice]: 'Juniors' }), mapping, 2).data?.registration.division)
      .toBe('juniors');
  });

  it('fails a 7th grader who chose nothing, pointing at the choice column', () => {
    const result = parseRow(row({ Grade: '7' }), mapping, 4);
    expect(result.data).toBeNull();
    expect(result.errors).toEqual([
      {
        row: 4,
        column: "7th Grade ONLY - Please choose which session you'd like to attend",
        field: 'division_choice',
        message: 'Division must be Juniors or Ambassadors',
      },
    ]);
  });

  it('reports which row, which column and why', () => {
    const result = parseRow(row({ 'Parent/Guardian Email': 'nope' }), mapping, 14);

    expect(result.data).toBeNull();
    expect(result.errors).toEqual([
      {
        row: 14,
        column: 'Parent/Guardian Email',
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
    const choice = "7th Grade ONLY - Please choose which session you'd like to attend";
    const result = parseRow(row({ Grade: '5', [choice]: 'Ambassadors' }), mapping, 3);

    expect(result.errors).toEqual([
      {
        row: 3,
        column: choice,
        field: 'division_choice',
        message: 'Grade 5 must be registered as juniors',
      },
    ]);
  });

  it('collects every problem in a row, not just the first', () => {
    const result = parseRow(
      row({ 'CISer First Name': '', DOB: 'nope', 'Youth T-Shirt Size': 'XXXL' }),
      mapping,
      5,
    );
    expect(result.errors.map((e) => e.field).sort()).toEqual(['dob', 'first_name', 'tshirt_size']);
  });

  it('keeps an optional field blank without complaint', () => {
    const result = parseRow(row({ 'Youth Email': 'n/a', 'Youth Phone Number': '-' }), mapping, 2);
    expect(result.errors).toEqual([]);
    expect(result.data?.kid.email).toBeNull();
  });

  it('never carries the raw Drive link through as a photo path', () => {
    // The link is fetched server-side in a later PR; photo_path is an object
    // path in the private bucket, never a URL.
    const withPhoto = mapHeaders([...HEADERS, 'Picture or Selfie of CISer']);
    const cells = [...row(), 'https://drive.google.com/file/d/abc/view'];
    expect(parseRow(cells, withPhoto, 2).data?.kid.photo_path).toBeNull();
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

  // Twins share all three values. The database index is deliberately non-unique
  // for this reason, and the importer must treat multiple matches as a row-level
  // error rather than picking one.
  it('collides for twins, which is why matching cannot silently pick a kid', () => {
    expect(identityKey({ first_name: 'Mina', last_name: 'Hanna', dob: '2014-03-05' }))
      .toBe(identityKey({ first_name: 'Mina', last_name: 'Hanna', dob: '2014-03-05' }));
  });
});
