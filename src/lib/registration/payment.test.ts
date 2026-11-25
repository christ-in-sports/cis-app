import {
  MAX_PAYMENT_CENTS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_IDS,
  formatCents,
  recordPaymentSchema,
  venmoAppUrl,
  venmoPayUrl,
} from './payment';

describe('formatCents', () => {
  it('drops the cents on whole dollars', () => {
    expect(formatCents(8500)).toBe('$85');
  });

  it('keeps two decimals otherwise', () => {
    expect(formatCents(4250)).toBe('$42.50');
    expect(formatCents(1)).toBe('$0.01');
  });

  it('groups thousands', () => {
    expect(formatCents(100_000)).toBe('$1,000');
  });
});

describe('recordPaymentSchema', () => {
  const parse = (amount: string, method = 'cash') =>
    recordPaymentSchema.safeParse({ amount, method });

  it('turns dollars into integer cents', () => {
    expect(parse('85').data?.amount).toBe(8500);
    expect(parse('42.5').data?.amount).toBe(4250);
    expect(parse(' 42.50 ').data?.amount).toBe(4250);
  });

  // 0.1 + 0.2 territory: 19.99 * 100 is 1998.9999999999998 in a float.
  it('rounds float noise rather than truncating it', () => {
    expect(parse('19.99').data?.amount).toBe(1999);
  });

  it.each(['', 'abc', '-5', '85.999', '1e3', '0x10', '$85'])(
    'rejects %p as a malformed amount',
    (amount) => {
      expect(parse(amount).success).toBe(false);
    },
  );

  it('rejects zero', () => {
    const r = parse('0');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/more than \$0/);
  });

  it('accepts the database maximum and rejects a cent over', () => {
    expect(parse(String(MAX_PAYMENT_CENTS / 100)).success).toBe(true);
    expect(parse('1000.01').success).toBe(false);
  });

  it('accepts only the methods the database allows', () => {
    for (const method of PAYMENT_METHOD_IDS) {
      expect(parse('10', method).success).toBe(true);
    }
    expect(parse('10', 'zelle').success).toBe(false);
    expect(parse('10', '').success).toBe(false);
  });
});

describe('PAYMENT_METHODS', () => {
  it('lists one entry per database method, in the order the form shows them', () => {
    expect(PAYMENT_METHODS.map((m) => m.id)).toEqual([...PAYMENT_METHOD_IDS]);
  });
});

describe('venmoPayUrl', () => {
  it('fills in the recipient, the $100 fee and the kid name note', () => {
    const url = new URL(venmoPayUrl('  Marina   Guirguis ', 10_000));
    expect(url.origin + url.pathname).toBe('https://account.venmo.com/pay');
    expect(url.searchParams.get('txn')).toBe('pay');
    expect(url.searchParams.get('recipients')).toBe('CIS-stantonios');
    expect(url.searchParams.get('amount')).toBe('100');
    expect(url.searchParams.get('note')).toBe('Marina Guirguis CIS Registration');
    // Spaces as %20, never "+".
    expect(url.search).toContain('note=Marina%20Guirguis%20CIS%20Registration');
  });

  it('still works before a name is typed, and without a fee', () => {
    const url = new URL(venmoPayUrl('', null));
    expect(url.searchParams.get('note')).toBe('CIS Registration');
    expect(url.searchParams.has('amount')).toBe(false);
  });

  it('keeps cents when the fee has them, and escapes the name', () => {
    const url = new URL(venmoPayUrl('Mina & Mark', 4250));
    expect(url.searchParams.get('amount')).toBe('42.50');
    expect(url.searchParams.get('note')).toBe('Mina & Mark CIS Registration');
  });
});

describe('venmoAppUrl', () => {
  it('opens the Venmo app with the same fields filled in', () => {
    const url = venmoAppUrl('Marina Guirguis', 10_000);
    expect(url).toBe(
      'venmo://paycharge?txn=pay&recipients=CIS-stantonios&amount=100&note=Marina%20Guirguis%20CIS%20Registration',
    );
  });
});
