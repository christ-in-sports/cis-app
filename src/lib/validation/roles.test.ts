import { roleChangeSchema } from './roles';

const userId = '3f2b6f0e-7d1a-4c53-9a0e-6f5d2a1b8c44';

describe('roleChangeSchema', () => {
  it.each(['admin', 'program', 'coach', 'prayer', 'parent'])('accepts %s', (role) => {
    expect(roleChangeSchema.safeParse({ userId, role }).success).toBe(true);
  });

  it('refuses the kid role: kids get it when they register, never from an Admin', () => {
    const result = roleChangeSchema.safeParse({ userId, role: 'kid' });
    expect(result.success).toBe(false);
  });

  it('refuses a role that does not exist', () => {
    expect(roleChangeSchema.safeParse({ userId, role: 'owner' }).success).toBe(false);
  });

  it('refuses something that is not a user id', () => {
    expect(roleChangeSchema.safeParse({ userId: 'not-a-uuid', role: 'coach' }).success).toBe(false);
  });
});
