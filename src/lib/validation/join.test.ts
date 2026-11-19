import {
  parentDisplayName,
  parentFirstNameSchema,
  parentLastNameSchema,
  sendJoinCodeSchema,
  verifyJoinCodeSchema,
} from './join';

describe('parent first and last name', () => {
  it('trims, and refuses an empty or very long name', () => {
    expect(parentFirstNameSchema.parse('  Mariam ')).toBe('Mariam');
    expect(parentLastNameSchema.parse(' Guirguis  ')).toBe('Guirguis');
    expect(parentFirstNameSchema.safeParse('   ').error?.issues[0]?.message).toBe('Enter your first name');
    expect(parentLastNameSchema.safeParse('').error?.issues[0]?.message).toBe('Enter your last name');
    expect(parentFirstNameSchema.safeParse('x'.repeat(51)).success).toBe(false);
  });

  it('joins them into one display name for the profile', () => {
    expect(parentDisplayName(' Mariam ', ' Guirguis ')).toBe('Mariam Guirguis');
  });
});

describe('sendJoinCodeSchema', () => {
  it('normalises the email and keeps both names', () => {
    expect(
      sendJoinCodeSchema.parse({ code: 'c', firstName: ' Mariam ', lastName: 'Guirguis ', email: ' Mariam@Example.COM ' }),
    ).toEqual({ code: 'c', firstName: 'Mariam', lastName: 'Guirguis', email: 'mariam@example.com' });
  });

  it('needs a code, a first name, a last name and an email', () => {
    const ok = { code: 'c', firstName: 'M', lastName: 'G', email: 'm@example.com' };
    expect(sendJoinCodeSchema.safeParse(ok).success).toBe(true);
    for (const key of ['code', 'firstName', 'lastName'] as const) {
      expect(sendJoinCodeSchema.safeParse({ ...ok, [key]: undefined }).success).toBe(false);
    }
    expect(sendJoinCodeSchema.safeParse({ ...ok, email: 'nope' }).success).toBe(false);
  });
});

describe('verifyJoinCodeSchema', () => {
  it('needs exactly six digits', () => {
    const base = { code: 'c', email: 'm@example.com' };
    expect(verifyJoinCodeSchema.safeParse({ ...base, token: '123456' }).success).toBe(true);
    expect(verifyJoinCodeSchema.safeParse({ ...base, token: '12345' }).success).toBe(false);
    expect(verifyJoinCodeSchema.safeParse({ ...base, token: 'abcdef' }).success).toBe(false);
  });
});
