import { parentNameSchema, sendJoinCodeSchema, verifyJoinCodeSchema } from './join';

describe('parentNameSchema', () => {
  it('trims, and refuses an empty or very long name', () => {
    expect(parentNameSchema.parse('  Mariam Guirguis ')).toBe('Mariam Guirguis');
    expect(parentNameSchema.safeParse('   ').success).toBe(false);
    expect(parentNameSchema.safeParse('x'.repeat(101)).success).toBe(false);
  });
});

describe('sendJoinCodeSchema', () => {
  it('normalises the email and keeps the name', () => {
    expect(
      sendJoinCodeSchema.parse({ code: 'c', name: ' Mariam ', email: ' Mariam@Example.COM ' }),
    ).toEqual({ code: 'c', name: 'Mariam', email: 'mariam@example.com' });
  });

  it('needs a code, a name and an email', () => {
    expect(sendJoinCodeSchema.safeParse({ name: 'M', email: 'm@example.com' }).success).toBe(false);
    expect(sendJoinCodeSchema.safeParse({ code: 'c', email: 'm@example.com' }).success).toBe(false);
    expect(sendJoinCodeSchema.safeParse({ code: 'c', name: 'M', email: 'nope' }).success).toBe(false);
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
