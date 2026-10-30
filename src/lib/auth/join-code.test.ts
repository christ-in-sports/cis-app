import { checkParentJoinCode, codeMatches } from './join-code';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, PARENT_JOIN_CODE: 'parent-code-123' };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

describe('codeMatches', () => {
  it('matches only the identical code', () => {
    expect(codeMatches('abc', 'abc')).toBe(true);
    expect(codeMatches('abd', 'abc')).toBe(false);
    expect(codeMatches('abcd', 'abc')).toBe(false);
    expect(codeMatches('', 'abc')).toBe(false);
  });
});

describe('checkParentJoinCode', () => {
  it('accepts the configured code, ignoring surrounding space', () => {
    expect(checkParentJoinCode('parent-code-123')).toBe('ok');
    expect(checkParentJoinCode('  parent-code-123 ')).toBe('ok');
  });

  it.each([['wrong-code'], [''], [undefined], [null], [123], [['parent-code-123']]])(
    'refuses %p',
    (input) => {
      expect(checkParentJoinCode(input)).toBe('wrong');
    },
  );

  it('does not accept the servant signup code', () => {
    process.env.SERVANT_SIGNUP_CODE = 'servant-code';
    expect(checkParentJoinCode('servant-code')).toBe('wrong');
  });

  it('refuses everything when the code is not configured, rather than matching an empty one', () => {
    delete process.env.PARENT_JOIN_CODE;
    expect(checkParentJoinCode('')).toBe('unconfigured');
    expect(checkParentJoinCode('anything')).toBe('unconfigured');
  });
});
