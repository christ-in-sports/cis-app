import { mapHeaders, normalizeHeader, headerFor, REQUIRED_FIELDS } from './columns';

/**
 * The 2026-27 registration form's questions, verbatim from a real 149-row
 * export. Note the stray trailing spaces and colons -- they are reproduced on
 * purpose, since matching has to survive them.
 */
const FORM_HEADERS = [
  'Timestamp',
  'Email Address',
  'CISer First Name',
  'CISer Last Name ',
  'Please upload a picture/selfie of the CISer',
  'Parent/Guardian ',
  'Parent/Guardian Phone number',
  'Parent/Guardian email:',
  'Youth phone number:',
  'Youth email:',
  'Youth tshirt size',
  'Gender',
  'DOB',
  'Grade',
  "7th Grade ONLY - Please choose which session you'd like to attend.",
  'For AMBASSADORS ONLY - Pick your TOP 4 ONLY CIS Sports',
  'For JUNIORS ONLY - Pick your TOP 4 ONLY CIS Sports',
  'Home Address',
  'Emergency Contact Name:',
  'Emergency contact Number:',
  'Paypal: paypal.me/ChristinSports/85\nVenmo: @CIS-stantonios\nCash to Sandy Boutros or Maria Meawad',
  'Have you filled out a consent form?',
  "Please use the below link for the Parent's Consent form.",
];

describe('normalizeHeader', () => {
  it('lower-cases and strips punctuation and spacing', () => {
    expect(normalizeHeader('CISer First Name')).toBe('ciserfirstname');
    expect(normalizeHeader('Parent/Guardian Phone Number')).toBe('parentguardianphonenumber');
    expect(normalizeHeader("7th Grade ONLY - Please choose which session you'd like to attend"))
      .toBe('7thgradeonlypleasechoosewhichsessionyoudliketoattend');
  });
});

describe('mapHeaders on the expected form export', () => {
  const mapping = mapHeaders(FORM_HEADERS);

  it('finds every required field', () => {
    expect(mapping.missingRequired).toEqual([]);
  });

  it.each([
    ['first_name', 2],
    ['last_name', 3],
    ['photo_link', 4],
    ['guardian_name', 5],
    ['guardian_phone', 6],
    ['guardian_email', 7],
    ['kid_phone', 8],
    ['kid_email', 9],
    ['tshirt_size', 10],
    ['gender', 11],
    ['dob', 12],
    ['grade', 13],
    ['division_choice', 14],
    ['top_sports_ambassadors', 15],
    ['top_sports_juniors', 16],
    ['home_address', 17],
    ['emergency_contact_name', 18],
    ['emergency_contact_phone', 19],
  ] as const)('maps %s to column %i', (field, index) => {
    expect(mapping.columnOf[field]).toBe(index);
  });

  it('understands every column in the export', () => {
    expect(mapping.unmapped).toEqual([]);
  });

  it('skips the automatic Timestamp column', () => {
    expect(mapping.ignored).toContain('Timestamp');
  });

  // Google Forms' own respondent field is whoever happened to be signed in: in
  // the real export it matches the parent's address in 78 of 149 rows and the
  // kid's in 13 of the 88 that have one. Both have their own question, so this
  // one is dropped rather than guessed at.
  it('skips the automatic Email Address column rather than guessing whose it is', () => {
    expect(mapping.ignored).toContain('Email Address');
    expect(mapping.columnOf.kid_email).toBe(FORM_HEADERS.indexOf('Youth email:'));
  });

  it('skips the payment and consent columns', () => {
    // Payment is a separate ticket, and imported registrations leave
    // consent_given_at null (docs/decisions.md).
    expect(mapping.ignored).toContain('Have you filled out a consent form?');
    expect(mapping.ignored).toContain("Please use the below link for the Parent's Consent form.");
    expect(mapping.ignored.some((h) => h.startsWith('Paypal'))).toBe(true);
  });

  it('picks up the two columns the previous importer ignored', () => {
    // Both are required by ENG-5: t-shirt size is a registration field, and the
    // photo link is what the Drive copy step will read.
    expect(mapping.columnOf.tshirt_size).toBeDefined();
    expect(mapping.columnOf.photo_link).toBeDefined();
  });

  it('keeps the two per-division sports columns apart', () => {
    expect(mapping.columnOf.top_sports_ambassadors)
      .not.toBe(mapping.columnOf.top_sports_juniors);
  });

  it('matches headers despite trailing spaces and colons', () => {
    expect(mapping.columnOf.last_name).toBe(FORM_HEADERS.indexOf('CISer Last Name '));
    expect(mapping.columnOf.guardian_email).toBe(FORM_HEADERS.indexOf('Parent/Guardian email:'));
  });

  it('records the verbatim header for each field, for error messages', () => {
    expect(headerFor(mapping, 'grade')).toBe('Grade');
    expect(headerFor(mapping, 'division_choice'))
      .toBe("7th Grade ONLY - Please choose which session you'd like to attend.");
  });
});

describe('mapHeaders resilience', () => {
  it('matches reworded headers through the fallback patterns', () => {
    const mapping = mapHeaders([
      'Date of Birth',
      'Surname',
      'Given Name',
      'Street Address',
      'What grade are they in?',
      'Emergency Contact Cell',
    ]);

    expect(mapping.columnOf.dob).toBe(0);
    expect(mapping.columnOf.last_name).toBe(1);
    expect(mapping.columnOf.first_name).toBe(2);
    expect(mapping.columnOf.home_address).toBe(3);
    expect(mapping.columnOf.grade).toBe(4);
    expect(mapping.columnOf.emergency_contact_phone).toBe(5);
  });

  it('prefers the more specific pattern when headers overlap', () => {
    // A bare /email/ rule would otherwise swallow the guardian's address.
    const mapping = mapHeaders(['Parent/Guardian Email', 'Youth Email']);
    expect(mapping.columnOf.guardian_email).toBe(0);
    expect(mapping.columnOf.kid_email).toBe(1);
  });

  it('separates the sports columns by division even if reworded', () => {
    const mapping = mapHeaders([
      'Juniors: pick your favourite sports',
      'Ambassadors: pick your favourite sports',
    ]);
    expect(mapping.columnOf.top_sports_juniors).toBe(0);
    expect(mapping.columnOf.top_sports_ambassadors).toBe(1);
    expect(mapping.unmapped).toEqual([]);
  });

  it('reports headers it does not understand instead of dropping them', () => {
    const mapping = mapHeaders([...FORM_HEADERS, 'Favourite ice cream']);
    expect(mapping.unmapped).toEqual(['Favourite ice cream']);
  });

  it('keeps the first of two columns claiming the same field', () => {
    const mapping = mapHeaders(['Grade', 'Grade Level']);
    expect(mapping.columnOf.grade).toBe(0);
    expect(mapping.unmapped).toEqual(['Grade Level']);
  });

  it('ignores an entirely blank header', () => {
    const mapping = mapHeaders(['Grade', '   ']);
    expect(mapping.unmapped).toEqual([]);
    expect(mapping.columnOf.grade).toBe(0);
  });

  it('lists the required fields that have no column at all', () => {
    const mapping = mapHeaders(['CISer First Name', 'CISer Last Name']);
    expect(mapping.missingRequired).toEqual(
      REQUIRED_FIELDS.filter((f) => f !== 'first_name' && f !== 'last_name'),
    );
  });

  it('falls back to a readable label when a field has no column', () => {
    expect(headerFor(mapHeaders([]), 'tshirt_size')).toBe('Youth tshirt size');
  });

  it('does not treat the optional fields as required', () => {
    // Per the ticket: kid email, kid phone and top sports are optional.
    // `allergies` and `photo_link` are nullable in the merged schema too.
    expect(REQUIRED_FIELDS).not.toContain('kid_email');
    expect(REQUIRED_FIELDS).not.toContain('kid_phone');
    expect(REQUIRED_FIELDS).not.toContain('top_sports');
    expect(REQUIRED_FIELDS).not.toContain('division_choice');
  });
});
