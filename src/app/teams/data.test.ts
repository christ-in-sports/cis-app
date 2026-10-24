import { getMyRoles } from '@/lib/auth/roles';
import { teamsAccess, requireTeamManager } from './data';

jest.mock('@/lib/auth/roles', () => ({ getMyRoles: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

function auth(roles: string[], userId: string | null = 'user') {
  const value = { userId, roles: new Set(roles), supabase: {} };
  jest.mocked(getMyRoles).mockResolvedValue(value as unknown as Awaited<ReturnType<typeof getMyRoles>>);
  return value;
}

it.each(['admin', 'program'])('allows %s onto the teams page', async (role) => {
  const value = auth([role]);
  expect(await teamsAccess()).toBe(value);
  expect(await requireTeamManager()).toBe(value);
});

it.each([[], ['coach'], ['prayer'], ['parent'], ['kid']].map((roles) => ({ roles })))('denies direct page access for $roles', async ({ roles }) => {
  auth(roles);
  await expect(teamsAccess()).rejects.toThrow('redirect:/');
});

it('preserves the requested teams destination for login', async () => {
  auth([], null);
  await expect(teamsAccess()).rejects.toThrow('redirect:/login?redirect=/teams');
});
