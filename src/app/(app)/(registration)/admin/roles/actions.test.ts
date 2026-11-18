/** @jest-environment node */
import { checkRole } from '@/lib/auth/roles';
import { grantRole, revokeRole } from './actions';

jest.mock('@/lib/auth/roles', () => ({ checkRole: jest.fn() }));
const person = '11111111-2222-4333-8444-555555555555';

it.each([grantRole, revokeRole])('requires Director before accessing role grants', async (action) => {
  const from = jest.fn();
  jest.mocked(checkRole).mockResolvedValue({ userId: person, hasRole: false, supabase: { from } } as unknown as Awaited<ReturnType<typeof checkRole>>);
  expect(await action(person, 'director')).toEqual({ ok: false, error: 'Only Directors can change roles.' });
  expect(checkRole).toHaveBeenCalledWith('director');
  expect(from).not.toHaveBeenCalled();
});
