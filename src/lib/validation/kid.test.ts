import {
  kidSchema,
  registrationSchema,
  registrationCoreSchema,
  TSHIRT_SIZES,
} from './kid';

/** A minimal valid kid: every required field, no optional ones. */
const validKid = {
  first_name: 'Mina',
  last_name: 'Hanna',
  dob: '2014-03-05',
  gender: 'male',
  home_address: '1 Main St, Hayward CA',
  emergency_contact_name: 'Sara Hanna',
  emergency_contact_phone: '(510) 555-1234',
  guardian_name: 'Sara Hanna',
  guardian_phone: '(510) 555-1234',
  guardian_email: 'sara@example.com',
};

const validRegistration = {
  grade: 5,
  division: 'juniors',
  tshirt_size: 'YM',
};

/** All issue paths, dot-joined, for terse assertions. */
const pathsOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((i) => i.path.join('.')) ?? [];

const messagesFor = (
  result: { error?: { issues: { path: PropertyKey[]; message: string }[] } },
  path: string,
) =>
  result.error?.issues.filter((i) => i.path.join('.') === path).map((i) => i.message) ?? [];

describe('kidSchema', () => {
  it('accepts a kid with only the required fields', () => {
    const result = kidSchema.safeParse(validKid);
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace rather than storing it', () => {
    const result = kidSchema.safeParse({ ...validKid, first_name: '  Mina  ' });
    expect(result.success && result.data.first_name).toBe('Mina');
  });

  it('rejects a whitespace-only value for a required field', () => {
    const result = kidSchema.safeParse({ ...validKid, first_name: '   ' });
    expect(pathsOf(result)).toContain('first_name');
  });

  // The ticket makes kid email, kid phone and top sports optional. `allergies`
  // is nullable too, matching the merged schema -- see the note in the sibling
  // describe block below.
  it('defaults every optional field to null when absent', () => {
    const result = kidSchema.safeParse(validKid);
    expect(result.success && result.data).toMatchObject({
      email: null,
      phone: null,
      allergies: null,
      photo_path: null,
      skill_tags: [],
    });
  });

  it('treats a blank optional cell as absent rather than an error', () => {
    const result = kidSchema.safeParse({ ...validKid, email: '   ', phone: '' });
    expect(result.success && result.data.email).toBeNull();
    expect(result.success && result.data.phone).toBeNull();
  });

  it('still reports a malformed optional email instead of silently nulling it', () => {
    const result = kidSchema.safeParse({ ...validKid, email: 'not-an-email' });
    expect(pathsOf(result)).toContain('email');
  });

  it('requires the guardian email and requires it to be well formed', () => {
    expect(pathsOf(kidSchema.safeParse({ ...validKid, guardian_email: undefined })))
      .toContain('guardian_email');
    expect(pathsOf(kidSchema.safeParse({ ...validKid, guardian_email: 'nope' })))
      .toContain('guardian_email');
  });

  it.each([
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
  ])('requires %s', (field) => {
    const result = kidSchema.safeParse({ ...validKid, [field]: undefined });
    expect(pathsOf(result)).toContain(field);
  });

  it('accepts only male or female for gender', () => {
    expect(kidSchema.safeParse({ ...validKid, gender: 'female' }).success).toBe(true);
    expect(pathsOf(kidSchema.safeParse({ ...validKid, gender: 'Male' }))).toContain('gender');
    expect(pathsOf(kidSchema.safeParse({ ...validKid, gender: 'other' }))).toContain('gender');
  });

  it('requires dob to be a real calendar date', () => {
    expect(pathsOf(kidSchema.safeParse({ ...validKid, dob: '2014-02-30' }))).toContain('dob');
    expect(pathsOf(kidSchema.safeParse({ ...validKid, dob: '03/05/2014' }))).toContain('dob');
  });
});

describe('registrationSchema grade and division rule', () => {
  it.each([4, 5, 6])('requires juniors for grade %i', (grade) => {
    expect(registrationSchema.safeParse({ ...validRegistration, grade, division: 'juniors' }).success)
      .toBe(true);

    const wrong = registrationSchema.safeParse({
      ...validRegistration,
      grade,
      division: 'ambassadors',
    });
    expect(pathsOf(wrong)).toContain('division');
  });

  it.each([8, 9, 10, 11, 12])('requires ambassadors for grade %i', (grade) => {
    expect(
      registrationSchema.safeParse({ ...validRegistration, grade, division: 'ambassadors' }).success,
    ).toBe(true);

    const wrong = registrationSchema.safeParse({
      ...validRegistration,
      grade,
      division: 'juniors',
    });
    expect(pathsOf(wrong)).toContain('division');
  });

  // The one grade that may choose -- the rule's real edge case.
  it.each(['juniors', 'ambassadors'])('lets grade 7 choose %s', (division) => {
    const result = registrationSchema.safeParse({ ...validRegistration, grade: 7, division });
    expect(result.success).toBe(true);
  });

  it('attaches the mismatch to division, so a form can show it on that field', () => {
    const result = registrationSchema.safeParse({
      ...validRegistration,
      grade: 6,
      division: 'ambassadors',
    });
    expect(messagesFor(result, 'division')).toEqual(['Grade 6 must be registered as juniors']);
  });

  it.each([3, 13, 0])('rejects grade %i as out of range', (grade) => {
    const result = registrationSchema.safeParse({ ...validRegistration, grade });
    expect(pathsOf(result)).toContain('grade');
  });

  // Regression: the refinement still runs after `grade` fails its range check,
  // so an unguarded version reported "must be registered as null" alongside the
  // real error.
  it('does not add a nonsense division message for an out-of-range grade', () => {
    const result = registrationSchema.safeParse({
      ...validRegistration,
      grade: 3,
      division: 'ambassadors',
    });
    expect(messagesFor(result, 'division')).toEqual([]);
    expect(pathsOf(result)).toEqual(['grade']);
  });

  it('rejects a non-integer grade', () => {
    expect(pathsOf(registrationSchema.safeParse({ ...validRegistration, grade: 5.5 })))
      .toContain('grade');
  });

  it('exposes the core schema un-refined, so a form can pick fields from it', () => {
    // ENG-4 builds a multi-step form and needs to validate a partial shape
    // before the whole registration exists.
    const step = registrationCoreSchema.pick({ tshirt_size: true });
    expect(step.safeParse({ tshirt_size: 'YM' }).success).toBe(true);
  });
});

describe('registrationSchema t-shirt size', () => {
  it.each(TSHIRT_SIZES)('accepts %s', (size) => {
    expect(registrationSchema.safeParse({ ...validRegistration, tshirt_size: size }).success)
      .toBe(true);
  });

  it('rejects anything outside the list and names the valid sizes', () => {
    const result = registrationSchema.safeParse({ ...validRegistration, tshirt_size: 'XXXL' });
    expect(messagesFor(result, 'tshirt_size')[0]).toContain('YS, YM, YL, XS, S, M, L, XL, XXL');
  });

  it('is case sensitive, so callers must normalise before validating', () => {
    expect(pathsOf(registrationSchema.safeParse({ ...validRegistration, tshirt_size: 'ym' })))
      .toContain('tshirt_size');
  });
});
