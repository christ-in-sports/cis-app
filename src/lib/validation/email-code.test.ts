import { emailCodeSchema, emailSchema } from './email-code';

describe('emailSchema', () => {
  it('trims and lower-cases an address', () => {
    expect(emailSchema.parse('  Maria@Example.COM ')).toBe('maria@example.com');
  });

  it('refuses something that is not an email', () => {
    expect(emailSchema.safeParse('maria').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('emailCodeSchema', () => {
  it('accepts exactly six digits, ignoring surrounding space', () => {
    expect(emailCodeSchema.parse(' 123456 ')).toBe('123456');
  });

  it.each(['12345', '1234567', '12345a', '', '123 456'])('refuses %p', (value) => {
    expect(emailCodeSchema.safeParse(value).success).toBe(false);
  });
});
