import { isUsPhone, normalizePhone, usPhone } from './phone';

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
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('isUsPhone', () => {
  it('accepts US numbers in the usual spellings', () => {
    expect(isUsPhone('510-555-1234')).toBe(true);
    expect(isUsPhone('(510) 555-1234')).toBe(true);
    expect(isUsPhone('+1 510 555 1234')).toBe(true);
  });

  it('rejects wrong lengths, letters and non-dialable area codes', () => {
    expect(isUsPhone('555-1234')).toBe(false);
    expect(isUsPhone('+44 20 7946 0958')).toBe(false);
    expect(isUsPhone('call me')).toBe(false);
    expect(isUsPhone('012-555-1234')).toBe(false);
    expect(isUsPhone('510-155-1234')).toBe(false);
  });
});

describe('usPhone', () => {
  const schema = usPhone('Phone');

  it('stores the normalised format', () => {
    expect(schema.parse(' 510.555.1234 ')).toBe('(510) 555-1234');
  });

  it('names the field when the number is invalid or missing', () => {
    expect(schema.safeParse('12345').error?.issues[0].message).toBe(
      'Phone must be a valid US phone number',
    );
    expect(schema.safeParse('  ').error?.issues[0].message).toBe('Phone is required');
  });
});
