/** @jest-environment node */
import { checkAnyRole } from './roles';
import { checkAdmin } from './admin';
jest.mock('./roles', () => ({ checkAnyRole: jest.fn() }));

it.each(['director', 'admin'])('allows %s to use shared operational features', async (role) => {
  const supabase = {};
  jest.mocked(checkAnyRole).mockImplementation(async (allowed) => ({ userId: 'me', hasRole: allowed.includes(role as 'director' | 'admin'), supabase } as Awaited<ReturnType<typeof checkAnyRole>>));
  expect(await checkAdmin()).toEqual({ userId: 'me', isAdmin: true, supabase });
  expect(checkAnyRole).toHaveBeenCalledWith(['director', 'admin']);
});
