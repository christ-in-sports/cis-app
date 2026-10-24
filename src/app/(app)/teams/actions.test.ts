import { assignCoach, assignKids, createTeam, deleteTeam, renameTeam } from './actions';
import { getMyRoles } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';

jest.mock('@/lib/auth/roles', () => ({ getMyRoles: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const teamId = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';
const kidId = 'c885f8bc-347d-4a99-82ea-d36bb1b35554';
const coachId = 'd885f8bc-347d-4a99-82ea-d36bb1b35554';
const season = { id: 'current-season', name: 'Current' };
const single = jest.fn();
const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), is: jest.fn().mockReturnThis(),
  maybeSingle: single, single, insert: jest.fn(), update: jest.fn().mockReturnThis(), delete: jest.fn() };
const from = jest.fn(() => query);
const rpc = jest.fn();

function auth(roles: string[], userId: string | null = 'user') {
  jest.mocked(getMyRoles).mockResolvedValue({ userId, roles: new Set(roles), supabase: { from, rpc } } as unknown as Awaited<ReturnType<typeof getMyRoles>>);
}

beforeEach(() => {
  jest.clearAllMocks();
  auth(['program']);
  single.mockResolvedValue({ data: season, error: null });
  query.insert.mockResolvedValue({ error: null });
  query.delete.mockReturnValue(query);
  rpc.mockResolvedValue({ data: 1, error: null });
});

const mutations = [
  () => createTeam({ name: 'Lions', division: 'juniors' }),
  () => renameTeam({ teamId, name: 'Tigers' }),
  () => deleteTeam(teamId),
  () => assignKids({ ids: [kidId], teamId }),
  () => assignCoach(teamId, coachId, true),
];

it.each([[], ['coach'], ['parent'], ['prayer'], ['kid']].map((roles) => ({ roles })))('rejects all team mutations for $roles before querying data', async ({ roles }) => {
  auth(roles);
  for (const mutate of mutations) expect((await mutate()).ok).toBe(false);
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});

it('rejects signed-out callers even if stale roles were supplied', async () => {
  auth(['admin'], null);
  expect((await mutations[0]()).ok).toBe(false);
  expect(from).not.toHaveBeenCalled();
});

it.each(['admin', 'program'])('%s creates a shared team in the current season and refreshes all three sections', async (role) => {
  auth([role]);
  expect(await mutations[0]()).toEqual({ ok: true });
  expect(query.eq).toHaveBeenCalledWith('is_current', true);
  expect(from).toHaveBeenCalledWith('ministry_teams');
  expect(query.insert).toHaveBeenCalledWith({ name: 'Lions', division: 'juniors', season_id: season.id });
  for (const path of ['/teams', '/attendance', '/sports']) expect(revalidatePath).toHaveBeenCalledWith(path, 'layout');
});

it('does not create a team in an older season when the current season is missing', async () => {
  single.mockResolvedValue({ data: null, error: null });
  expect((await mutations[0]()).ok).toBe(false);
  expect(query.insert).not.toHaveBeenCalled();
});

it('assigns registration IDs through the existing atomic, permission-checked RPC', async () => {
  expect(await mutations[3]()).toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith('assign_attendance_team', { p_registrations: [kidId], p_team: teamId });
  expect(from).not.toHaveBeenCalledWith('kids');
});

it('surfaces season/division/role errors from the database without reporting success', async () => {
  rpc.mockResolvedValue({ error: { message: 'Choose active kids and a team in the same current season and division' } });
  expect(await mutations[3]()).toMatchObject({ ok: false, error: expect.stringContaining('current season') });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it('updates shared coach links and retains the soft-delete RPC for sports references', async () => {
  expect(await mutations[4]()).toEqual({ ok: true });
  expect(query.insert).toHaveBeenCalledWith({ team_id: teamId, user_id: coachId });
  expect(await mutations[2]()).toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith('delete_attendance_team', { p_team: teamId });
});

it('rejects invalid input and reports duplicate team names', async () => {
  expect((await createTeam({ name: ' ', division: 'juniors' })).ok).toBe(false);
  expect(from).not.toHaveBeenCalled();
  query.insert.mockResolvedValue({ error: { code: '23505' } });
  expect(await mutations[0]()).toMatchObject({ ok: false, error: expect.stringContaining('already exists') });
});
