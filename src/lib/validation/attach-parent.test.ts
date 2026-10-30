import { attachParentSchema, findParentSchema } from './attach-parent';

const KID = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';

describe('findParentSchema', () => {
  it('trims and lower-cases the email, so it matches the stored address', () => {
    expect(findParentSchema.parse({ email: '  Mariam@Example.COM ' })).toEqual({ email: 'mariam@example.com' });
  });

  it('refuses something that is not an email', () => {
    expect(findParentSchema.safeParse({ email: 'mariam' }).success).toBe(false);
  });
});

describe('attachParentSchema', () => {
  it('needs a kid id and an email', () => {
    expect(attachParentSchema.parse({ kidId: KID, email: 'a@b.co' })).toEqual({ kidId: KID, email: 'a@b.co' });
    expect(attachParentSchema.safeParse({ kidId: 'nope', email: 'a@b.co' }).success).toBe(false);
    expect(attachParentSchema.safeParse({ kidId: KID }).success).toBe(false);
  });
});
