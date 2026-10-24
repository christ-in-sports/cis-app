import { render, screen } from '@testing-library/react';
import TeamsPage from './page';
import { getMyRoles } from '@/lib/auth/roles';
import { loadKidPhotos } from '@/lib/photo/signed-urls';

jest.mock('@/lib/auth/roles', () => ({ getMyRoles: jest.fn() }));
jest.mock('@/lib/photo/signed-urls', () => ({ loadKidPhotos: jest.fn() }));
jest.mock('./teams-client', () => ({ __esModule: true, default: ({ kids }: { kids: { id: string; first_name: string }[] }) => <ul>{kids.map((kid) => <li key={kid.id}>{kid.first_name}</li>)}</ul> }));

const roster = [{ id: 'registration-id', kid_id: 'kid-id', grade: 6, division: 'juniors', team_id: null, kids: { first_name: 'Current child', last_name: 'Test' } }];
function query(data: unknown) {
  return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
}
let queries: Record<string, ReturnType<typeof query>>;
let from: jest.Mock;
let rpc: jest.Mock;

beforeEach(() => {
  queries = { seasons: query({ id: 'current-season', name: 'Current season' }), registrations: query(roster), ministry_teams: query([]), team_coaches: query([]) };
  from = jest.fn((table: string) => queries[table]);
  rpc = jest.fn().mockResolvedValue({ data: [], error: null });
  jest.mocked(getMyRoles).mockResolvedValue({ userId: 'user', roles: new Set(['program']), supabase: { from, rpc } } as unknown as Awaited<ReturnType<typeof getMyRoles>>);
  jest.mocked(loadKidPhotos).mockResolvedValue(new Map());
});

it('lists active current-season registrations, joining kids only for display fields', async () => {
  render(await TeamsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('Current child')).toBeInTheDocument();
  expect(queries.seasons.eq).toHaveBeenCalledWith('is_current', true);
  expect(queries.registrations.eq).toHaveBeenCalledWith('season_id', 'current-season');
  expect(queries.registrations.eq).toHaveBeenCalledWith('active', true);
  expect(queries.ministry_teams.eq).toHaveBeenCalledWith('season_id', 'current-season');
  expect(queries.ministry_teams.eq).toHaveBeenCalledWith('active', true);
  expect(from).not.toHaveBeenCalledWith('kids');
  expect(rpc).not.toHaveBeenCalledWith('attendance_roster_season');
});

it('keeps the current season when its registrations are empty', async () => {
  queries.registrations = query([]);
  render(await TeamsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('heading', { name: 'Teams' })).toBeInTheDocument();
  expect(queries.registrations.eq).toHaveBeenCalledWith('season_id', 'current-season');
  expect(rpc).not.toHaveBeenCalledWith('attendance_roster_season');
});

it('uses the frozen archive roster without querying live registrations', async () => {
  render(await TeamsPage({ searchParams: Promise.resolve({ view: 'archive' }) }));
  expect(screen.getByRole('heading', { name: 'Archived teams' })).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith('archived_attendance_team_roster');
  expect(from).not.toHaveBeenCalledWith('registrations');
});
