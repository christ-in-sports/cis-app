/**
 * The sports Server Actions, end to end (ENG-14).
 *
 * These call the real actions in src/app/sports/actions.ts, which call the real
 * operations in src/lib/competition/service.ts, which talk to the local Supabase
 * stack over PostgREST as real signed-in users. That is deliberate: it exercises
 * what the pg-level tests in competition.test.ts cannot -- the API grants (who
 * may execute the functions, which sport_blocks columns are writable), the Zod
 * validation, the generators feeding `create_sport_block_games()`, and the
 * advance-the-bracket flow as the app will actually drive it.
 *
 * Only two things are mocked: `next/cache` (no Next runtime here) and the server
 * Supabase client, which is pointed at whichever test user is "signed in".
 *
 * Unlike the other suites these commit data (PostgREST has no transaction to roll
 * back), so every row they create hangs off throwaway seasons that are deleted in
 * afterAll, and the suite refuses to run against anything but a local database.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

let current: SupabaseClient;

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => current,
}));

import {
  clearGameDay,
  clearResult,
  completeSportBlock,
  generateKnockout,
  generateLeagueFixtures,
  recordResult,
  resetSportBlock,
  saveSportBlock,
  scheduleGameDay,
} from '@/app/sports/actions';

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// The same well-known demo keys every `supabase start` stack uses (see ci.yml, e2e/).
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'localdevpassword123';

const host = new URL(DB_URL).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error(`competition-actions tests commit data and only run against a local database, not "${host}".`);
}

const pool = new Pool({ connectionString: DB_URL });
const seasonIds: string[] = [];
const userIds: string[] = [];
const extraBlockIds: string[] = [];

afterAll(async () => {
  await pool.query('delete from sport_blocks where season_id = any($1) or id = any($2)', [seasonIds, extraBlockIds]);
  await pool.query('delete from ministry_teams where season_id = any($1)', [seasonIds]);
  await pool.query('delete from seasons where id = any($1)', [seasonIds]);
  await pool.query('delete from user_roles where user_id = any($1)', [userIds]);
  await pool.query('delete from auth.users where id = any($1)', [userIds]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Division = 'juniors' | 'ambassadors';

async function makeUser(roles: string[]): Promise<SupabaseClient> {
  const email = `comp-${randomUUID().slice(0, 8)}@local.test`;
  const res = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const body = (await res.json()) as { id?: string; msg?: string };
  if (!body.id) throw new Error(`could not create test user: ${JSON.stringify(body)}`);
  userIds.push(body.id);
  for (const role of roles) {
    await pool.query('insert into user_roles (user_id, role) values ($1, $2)', [body.id, role]);
  }
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

const signedOut = () => createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function makeSeason(counts: Partial<Record<Division, number>>) {
  const season = (
    await pool.query(`insert into seasons (name, is_current, starts_on) values ($1, false, '2030-01-01') returning id`, [
      `ENG-14 ${randomUUID().slice(0, 6)}`,
    ])
  ).rows[0].id as string;
  seasonIds.push(season);

  const teams: Record<Division, string[]> = { juniors: [], ambassadors: [] };
  for (const division of ['juniors', 'ambassadors'] as const) {
    for (let i = 1; i <= (counts[division] ?? 0); i++) {
      teams[division].push(
        (
          await pool.query(
            `insert into ministry_teams (name, division, season_id) values ($1, $2, $3) returning id`,
            [`${division[0].toUpperCase()}${i}`, division, season]
          )
        ).rows[0].id
      );
    }
  }
  return { season, teams };
}

async function newBlock(season: string, over: Record<string, unknown>): Promise<string> {
  const r = await saveSportBlock({ seasonId: season, ...over });
  if (!r.ok) throw new Error(`could not create block: ${r.error}`);
  return (r as { blockId: string }).blockId;
}

interface Game {
  id: string;
  label: string;
  stage: string;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
  group_label: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  court: number | null;
}

async function gamesOf(block: string): Promise<Game[]> {
  return (
    await pool.query(
      `select id, label, stage, status, home_team_id, away_team_id, group_label,
              scheduled_date::text, scheduled_time::text, court
         from games where sport_block_id = $1 order by round, label`,
      [block]
    )
  ).rows;
}

const placesOf = async (block: string) =>
  (await pool.query('select team_id, place from sport_block_places where sport_block_id = $1 order by place', [block]))
    .rows as { team_id: string; place: number }[];

const statusOf = async (block: string) =>
  (await pool.query('select status from sport_blocks where id = $1', [block])).rows[0].status as string;

const SOCCER = (home: number, away: number) => ({ home, away });

/** The team with the lower index in `order` wins 2-1: a fixed, known table. */
const lowerIndexWins = (order: string[], g: Game) => {
  const homeWins = order.indexOf(g.home_team_id!) < order.indexOf(g.away_team_id!);
  return homeWins ? SOCCER(2, 1) : SOCCER(1, 2);
};

async function recordAll(games: Game[], details: (g: Game) => unknown) {
  for (const g of games) {
    const r = await recordResult({ gameId: g.id, details: details(g) });
    if (!r.ok) throw new Error(`could not record ${g.label}: ${r.error}`);
  }
}

/** Plays every playable knockout game, the home team winning, until none is left. */
async function playOut(block: string, details: (g: Game) => unknown = () => SOCCER(2, 1)) {
  for (let guard = 0; guard < 40; guard++) {
    const next = (await gamesOf(block)).find((g) => g.status === 'scheduled' && g.home_team_id && g.away_team_id);
    if (!next) return;
    const r = await recordResult({ gameId: next.id, details: details(next) });
    if (!r.ok) throw new Error(`could not record ${next.label}: ${r.error}`);
  }
  throw new Error('playOut did not finish');
}

const league = { division: 'juniors', sport: 'soccer', format: 'league' } as const;

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

describe('who may use the sports actions', () => {
  it('refuses a signed-out caller', async () => {
    current = signedOut();
    const r = await saveSportBlock(league);
    expect(r).toEqual({ ok: false, error: 'You are no longer signed in.' });
  });

  it.each(['coach', 'prayer', 'parent', 'kid'])('refuses a %s, and writes nothing', async (role) => {
    const { season } = await makeSeason({ juniors: 6 });
    current = await makeUser([role]);

    const r = await saveSportBlock({ seasonId: season, ...league });
    expect(r).toEqual({ ok: false, error: 'Only Admin or Program Team can update sports standings.' });
    expect((await pool.query('select 1 from sport_blocks where season_id = $1', [season])).rowCount).toBe(0);
  });

  it.each([['admin'], ['program'], ['admin', 'program']])('lets %s create a block', async (...roles) => {
    const { season } = await makeSeason({});
    current = await makeUser(roles);
    const r = await saveSportBlock({ seasonId: season, ...league });
    expect(r.ok).toBe(true);
  });

  it('turns bad input into a message before touching the database', async () => {
    current = await makeUser(['program']);
    expect(await saveSportBlock({ ...league, sport: 'curling' })).toEqual({
      ok: false,
      error: 'That sport is not set up yet',
    });
    expect(await saveSportBlock({ ...league, format: 'league_knockout' })).toEqual({
      ok: false,
      error: 'Choose a league structure',
    });
    expect((await recordResult({ gameId: 'nope', details: {} })).ok).toBe(false);
    expect(await scheduleGameDay({ blockId: randomUUID(), date: '2030-02-01', startTime: '14:00', slots: 0, courts: 2 })).toEqual({
      ok: false,
      error: 'A game day needs at least one slot',
    });
  });

  it('keeps a non-writer from the functions even when they bypass the action', async () => {
    const { season } = await makeSeason({ juniors: 6 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, league);
    await generateLeagueFixtures({ blockId });
    const game = (await gamesOf(blockId))[0];

    const coach = await makeUser(['coach']);
    const direct = await coach.rpc('record_game_result', {
      p_game_id: game.id,
      p_home_total: 1,
      p_away_total: 0,
      p_tiebreak_winner: null,
      p_details: SOCCER(1, 0),
    });
    expect(direct.error?.code).toBe('42501');
    const insert = await coach.from('games').insert({ sport_block_id: blockId, stage: 'league', round: 1, label: 'x' });
    expect(insert.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

describe('sport blocks', () => {
  it('defaults a new block to the current season', async () => {
    const existing = await pool.query('select id from seasons where is_current limit 1');
    let created: string | null = null;
    if (existing.rowCount === 0) {
      created = (await pool.query(`insert into seasons (name, is_current, starts_on) values ('ENG-14 current', true, '2030-06-01') returning id`)).rows[0].id;
      seasonIds.push(created!);
    }
    current = await makeUser(['program']);
    const r = await saveSportBlock({ division: 'juniors', sport: 'dodgeball', format: 'knockout' });
    expect(r.ok).toBe(true);
    const id = (r as { blockId: string }).blockId;
    extraBlockIds.push(id);
    const row = (await pool.query('select s.is_current from sport_blocks b join seasons s on s.id = b.season_id where b.id = $1', [id])).rows[0];
    expect(row.is_current).toBe(true);
  });

  it('refuses a second block for the same sport and division in a season', async () => {
    const { season } = await makeSeason({});
    current = await makeUser(['program']);
    await newBlock(season, league);
    expect(await saveSportBlock({ seasonId: season, ...league })).toEqual({
      ok: false,
      error: 'That sport already has a block for this division this season.',
    });
  });

  it('edits settings and dates of a block with games, but not its format, until it is reset', async () => {
    const { season } = await makeSeason({ juniors: 6 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, { ...league, format: 'league_knockout', leagueStructure: 'groups' });
    await generateLeagueFixtures({ blockId });
    const before = (await gamesOf(blockId)).length;
    expect(before).toBe(6); // two groups of 3, a round-robin each

    const edit = await saveSportBlock({
      id: blockId,
      ...league,
      format: 'league_knockout',
      leagueStructure: 'groups',
      settings: { gameMinutes: 25 },
      startsOn: '2030-02-01',
      endsOn: '2030-02-28',
    });
    expect(edit.ok).toBe(true);
    expect((await gamesOf(blockId)).length).toBe(before);

    const change = await saveSportBlock({ id: blockId, ...league, format: 'league' });
    expect(change.ok).toBe(false);
    expect((change as { error: string }).error).toMatch(/already has games/);
    expect((await gamesOf(blockId)).length).toBe(before);

    expect((await resetSportBlock({ blockId })).ok).toBe(true);
    expect(await gamesOf(blockId)).toHaveLength(0);
    expect(await statusOf(blockId)).toBe('setup');
    expect((await saveSportBlock({ id: blockId, ...league, format: 'league' })).ok).toBe(true);
  });

  it('reports a missing block', async () => {
    current = await makeUser(['program']);
    expect(await saveSportBlock({ id: randomUUID(), ...league })).toEqual({ ok: false, error: 'Sport block not found.' });
    expect(await generateLeagueFixtures({ blockId: randomUUID() })).toEqual({ ok: false, error: 'Sport block not found.' });
  });

  it('will not build a block for a division without 6 to 8 teams', async () => {
    const { season } = await makeSeason({ juniors: 4 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, league);
    const r = await generateLeagueFixtures({ blockId });
    expect(r).toEqual({ ok: false, error: 'A block needs 6 to 8 active teams, and juniors has 4 this season.' });
    expect(await gamesOf(blockId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A league, start to finish
// ---------------------------------------------------------------------------

describe('a league-only block', () => {
  it('generates fixtures, records results, and completes with the table as places', async () => {
    const { season, teams } = await makeSeason({ juniors: 6 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, league);

    const gen = await generateLeagueFixtures({ blockId });
    expect(gen).toEqual({ ok: true, games: 15 });
    expect(await statusOf(blockId)).toBe('league');

    const again = await generateLeagueFixtures({ blockId });
    expect(again).toEqual({ ok: false, error: 'This block already has games. Reset it to generate them again.' });
    expect((await generateKnockout({ blockId })).ok).toBe(false);

    const games = await gamesOf(blockId);
    expect(games).toHaveLength(15);
    expect(new Set(games.flatMap((g) => [g.home_team_id, g.away_team_id])).size).toBe(6);

    // Bad details are refused with a reason, and nothing is written.
    const bad = await recordResult({ gameId: games[0].id, details: { home: -1, away: 0 } });
    expect(bad.ok).toBe(false);
    expect((await gamesOf(blockId))[0].status).toBe('scheduled');

    // Too early to complete.
    const early = await completeSportBlock({ blockId });
    expect(early).toEqual({ ok: false, error: '15 games still need a result.' });

    await recordAll(games, (g) => lowerIndexWins(teams.juniors, g));
    expect((await completeSportBlock({ blockId })).ok).toBe(true);

    // Lower index beats higher index everywhere, so the table is the team order.
    const places = await placesOf(blockId);
    expect(places.map((p) => p.team_id)).toEqual(teams.juniors);
    expect(places.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await statusOf(blockId)).toBe('completed');

    expect(await completeSportBlock({ blockId })).toEqual({ ok: false, error: 'This block is already completed.' });
    expect((await recordResult({ gameId: games[0].id, details: SOCCER(0, 5) })).ok).toBe(false);
  });

  it('stores a drawn league game with no winner', async () => {
    const { season } = await makeSeason({ juniors: 6 });
    current = await makeUser(['admin']);
    const blockId = await newBlock(season, league);
    await generateLeagueFixtures({ blockId });
    const game = (await gamesOf(blockId))[0];

    expect((await recordResult({ gameId: game.id, details: SOCCER(1, 1) })).ok).toBe(true);
    const r = (await pool.query('select winner_team_id, home_total, away_total, recorded_by from game_results where game_id = $1', [game.id])).rows[0];
    expect(r.winner_team_id).toBeNull();
    expect([r.home_total, r.away_total]).toEqual([1, 1]);
    expect(r.recorded_by).toBeTruthy();

    // A league game has no tiebreak.
    const withTiebreak = await recordResult({ gameId: game.id, details: SOCCER(1, 1), tiebreakWinner: 'home' });
    expect(withTiebreak.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// League then knockout, two groups
// ---------------------------------------------------------------------------

describe('a league then knockout block played in two groups', () => {
  it('seeds the bracket from both group tables and finishes with places 1 to 8', async () => {
    const { season, teams } = await makeSeason({ ambassadors: 8 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, {
      division: 'ambassadors',
      sport: 'basketball',
      format: 'league_knockout',
      leagueStructure: 'groups',
    });

    expect(await generateKnockout({ blockId })).toEqual({ ok: false, error: 'Generate the league fixtures first.' });
    expect(await generateLeagueFixtures({ blockId })).toEqual({ ok: true, games: 12 });
    expect(await generateKnockout({ blockId })).toEqual({
      ok: false,
      error: '12 league games still need a result before the knockout stage can be created.',
    });

    const league = await gamesOf(blockId);
    const groupOf = new Map<string, string>();
    for (const g of league) {
      groupOf.set(g.home_team_id!, g.group_label!);
      groupOf.set(g.away_team_id!, g.group_label!);
    }
    expect([...groupOf.values()].filter((x) => x === 'A')).toHaveLength(4);

    await recordAll(league, (g) => lowerIndexWins(teams.ambassadors, g));
    expect((await generateKnockout({ blockId })).ok).toBe(true);
    expect(await statusOf(blockId)).toBe('knockout');

    const knockout = (await gamesOf(blockId)).filter((g) => g.stage !== 'league');
    expect(knockout).toHaveLength(8);

    // Semi-finals pair a group winner with the other group's runner-up.
    for (const label of ['Semi-final 1', 'Semi-final 2']) {
      const sf = knockout.find((g) => g.label === label)!;
      expect(groupOf.get(sf.home_team_id!)).not.toBe(groupOf.get(sf.away_team_id!));
    }

    // League results are now locked.
    const locked = await recordResult({ gameId: league[0].id, details: SOCCER(0, 9) });
    expect(locked.ok).toBe(false);
    expect((locked as { error: string }).error).toMatch(/locked/);
    expect((await generateKnockout({ blockId })).ok).toBe(false);

    // A level knockout game needs a tiebreak winner.
    const first = knockout.find((g) => g.home_team_id && g.away_team_id)!;
    const level = await recordResult({ gameId: first.id, details: SOCCER(1, 1) });
    expect(level.ok).toBe(false);
    expect((level as { error: string }).error).toMatch(/needs a winner/);
    expect((await recordResult({ gameId: first.id, details: SOCCER(1, 1), tiebreakWinner: 'away' })).ok).toBe(true);
    // The tiebreak winner (the away team) is now in a later game, and the loser is not.
    const later = (await gamesOf(blockId)).filter((g) => g.stage !== 'league' && g.id !== first.id);
    const inLater = (team: string | null) => later.some((g) => g.home_team_id === team || g.away_team_id === team);
    expect(inLater(first.away_team_id)).toBe(true);

    await playOut(blockId);
    expect((await completeSportBlock({ blockId })).ok).toBe(true);

    const places = await placesOf(blockId);
    expect(places.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(places.map((p) => p.team_id)).size).toBe(8);
  });

  it('corrects a score after the next game was played, but not who won', async () => {
    const { season, teams } = await makeSeason({ ambassadors: 6 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, { division: 'ambassadors', sport: 'soccer', format: 'knockout' });
    expect(await generateKnockout({ blockId })).toEqual({ ok: true, games: 7 });
    expect(teams.ambassadors).toHaveLength(6);

    const byLabel = async () => Object.fromEntries((await gamesOf(blockId)).map((g) => [g.label, g]));
    let g = await byLabel();
    await recordResult({ gameId: g['Quarter-final 1'].id, details: SOCCER(2, 1) });
    g = await byLabel();
    await recordResult({ gameId: g['Semi-final 1'].id, details: SOCCER(2, 1) });

    expect((await recordResult({ gameId: g['Quarter-final 1'].id, details: SOCCER(3, 0) })).ok).toBe(true);
    const flipped = await recordResult({ gameId: g['Quarter-final 1'].id, details: SOCCER(0, 3) });
    expect(flipped.ok).toBe(false);
    expect((flipped as { error: string }).error).toMatch(/already been played/);

    // Clear the later game first and the flip goes through.
    expect((await clearResult({ gameId: g['Semi-final 1'].id })).ok).toBe(true);
    expect((await recordResult({ gameId: g['Quarter-final 1'].id, details: SOCCER(0, 3) })).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A knockout-only block, with a sport that scores in sets
// ---------------------------------------------------------------------------

describe('a knockout-only block of seven teams', () => {
  it('builds a bracket straight away, checks set scores, and places every team', async () => {
    const { season } = await makeSeason({ juniors: 7 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, {
      division: 'juniors',
      sport: 'volleyball',
      format: 'knockout',
      settings: { maxSets: 3 },
    });

    expect((await generateLeagueFixtures({ blockId })).ok).toBe(false);
    expect(await generateKnockout({ blockId })).toEqual({ ok: true, games: 9 });
    expect(await statusOf(blockId)).toBe('knockout');
    expect((await generateKnockout({ blockId })).ok).toBe(false);

    const first = (await gamesOf(blockId)).find((g) => g.home_team_id && g.away_team_id)!;
    const tooMany = await recordResult({
      gameId: first.id,
      details: { sets: [{ home: 25, away: 1 }, { home: 25, away: 1 }, { home: 25, away: 1 }, { home: 25, away: 1 }] },
    });
    expect(tooMany).toEqual({ ok: false, error: 'At most 3 sets' });

    const wrongShape = await recordResult({ gameId: first.id, details: { home: 2, away: 0 } });
    expect(wrongShape.ok).toBe(false);

    const won = (n: number) => ({ sets: Array.from({ length: n }, () => ({ home: 25, away: 20 })) });
    await playOut(blockId, () => won(2));
    expect((await completeSportBlock({ blockId })).ok).toBe(true);
    expect((await placesOf(blockId)).map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    // Every game's per-set detail was kept, and the totals are sets won.
    const stored = (
      await pool.query(
        `select r.home_total, r.away_total, r.details from game_results r
           join games g on g.id = r.game_id where g.sport_block_id = $1`,
        [blockId]
      )
    ).rows;
    expect(stored).toHaveLength(9);
    for (const r of stored) {
      expect(r.details.sets).toHaveLength(2);
      expect([r.home_total, r.away_total]).toEqual([2, 0]);
    }
  });
});

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

describe('scheduling game days', () => {
  const date = '2030-03-02';

  it('fills the cells, never double-books a team, and keeps blocks off each other\'s courts', async () => {
    const { season } = await makeSeason({ juniors: 7, ambassadors: 6 });
    current = await makeUser(['program']);
    const jr = await newBlock(season, { division: 'juniors', sport: 'volleyball', format: 'knockout' });
    const am = await newBlock(season, { division: 'ambassadors', sport: 'soccer', format: 'league' });
    await generateKnockout({ blockId: jr });
    await generateLeagueFixtures({ blockId: am });

    // 9 games, 6 cells (6 slots, 1 court).
    const day = { date, startTime: '14:00', slots: 6, courts: 1 };
    const first = await scheduleGameDay({ blockId: jr, ...day });
    expect(first).toEqual({ ok: true, placed: 6, unplaced: 3, openCells: 0 });

    const scheduled = (await gamesOf(jr)).filter((g) => g.scheduled_date);
    expect(scheduled).toHaveLength(6);

    // No team plays twice at the same time.
    const byTime = new Map<string, string[]>();
    for (const g of scheduled) {
      const teams = byTime.get(g.scheduled_time!) ?? [];
      byTime.set(g.scheduled_time!, [...teams, g.home_team_id, g.away_team_id].filter(Boolean) as string[]);
    }
    for (const teams of byTime.values()) expect(new Set(teams).size).toBe(teams.length);

    // A game never sits before or in the slot of a game that feeds it.
    const edges = (
      await pool.query('select id, winner_to_game_id w, loser_to_game_id l from games where sport_block_id = $1', [jr])
    ).rows as { id: string; w: string | null; l: string | null }[];
    const timeOf = new Map((await gamesOf(jr)).map((g) => [g.id, g.scheduled_time]));
    for (const e of edges) {
      for (const target of [e.w, e.l]) {
        if (target && timeOf.get(e.id) && timeOf.get(target)) {
          expect(timeOf.get(target)! > timeOf.get(e.id)!).toBe(true);
        }
      }
    }

    // Nothing free left, so asking again places nothing.
    expect(await scheduleGameDay({ blockId: jr, ...day })).toMatchObject({ ok: true, placed: 0 });

    // The other block, same date, same times and the one court: it must go around.
    const sameCourt = await scheduleGameDay({ blockId: am, ...day });
    expect(sameCourt).toMatchObject({ ok: true, placed: 0 });
    const twoCourts = await scheduleGameDay({ blockId: am, ...day, courts: 2 });
    expect(twoCourts.ok).toBe(true);

    const all = (
      await pool.query(
        `select scheduled_time::text t, court from games where scheduled_date = $1 and sport_block_id = any($2)`,
        [date, [jr, am]]
      )
    ).rows as { t: string; court: number }[];
    expect(new Set(all.map((r) => `${r.t}:${r.court}`)).size).toBe(all.length);
    expect(all.length).toBeGreaterThan(6);

    // The rest goes on a later day.
    expect((await scheduleGameDay({ blockId: jr, ...day, date: '2030-03-09' }))).toMatchObject({ ok: true, placed: 3 });
  });

  it('clears the unplayed games off a day and leaves played ones alone', async () => {
    const { season, teams } = await makeSeason({ ambassadors: 6 });
    current = await makeUser(['admin']);
    const blockId = await newBlock(season, { division: 'ambassadors', sport: 'soccer', format: 'league' });
    await generateLeagueFixtures({ blockId });
    const day = { blockId, date, startTime: '10:00', slots: 5, courts: 2 };
    expect(await scheduleGameDay(day)).toMatchObject({ ok: true, placed: 10 });

    const played = (await gamesOf(blockId)).find((g) => g.scheduled_date)!;
    await recordResult({ gameId: played.id, details: lowerIndexWins(teams.ambassadors, played) });

    expect(await clearGameDay({ blockId, date })).toEqual({ ok: true, cleared: 9 });
    const after = await gamesOf(blockId);
    expect(after.filter((g) => g.scheduled_date)).toHaveLength(1);
    expect(after.find((g) => g.id === played.id)).toMatchObject({ status: 'completed', scheduled_date: date });
    expect((await pool.query('select 1 from game_results where game_id = $1', [played.id])).rowCount).toBe(1);

    // And the freed cells can be filled again.
    expect(await scheduleGameDay(day)).toMatchObject({ ok: true, placed: 9 });
  });

  it('refuses a completed block', async () => {
    const { season, teams } = await makeSeason({ juniors: 6 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, league);
    await generateLeagueFixtures({ blockId });
    await recordAll(await gamesOf(blockId), (g) => lowerIndexWins(teams.juniors, g));
    await completeSportBlock({ blockId });
    const r = await scheduleGameDay({ blockId, date, startTime: '14:00', slots: 4, courts: 2 });
    expect(r).toEqual({ ok: false, error: 'This block is completed. Reset it to change the schedule.' });
  });
});

describe('resetting a block', () => {
  it('is for Admin and Program Team only, and wipes games, results and places', async () => {
    const { season, teams } = await makeSeason({ juniors: 6 });
    current = await makeUser(['program']);
    const blockId = await newBlock(season, league);
    await generateLeagueFixtures({ blockId });
    await recordAll(await gamesOf(blockId), (g) => lowerIndexWins(teams.juniors, g));
    await completeSportBlock({ blockId });

    current = await makeUser(['coach']);
    expect((await resetSportBlock({ blockId })).ok).toBe(false);
    expect(await gamesOf(blockId)).toHaveLength(15);

    current = await makeUser(['admin']);
    expect((await resetSportBlock({ blockId })).ok).toBe(true);
    expect(await gamesOf(blockId)).toHaveLength(0);
    expect(await placesOf(blockId)).toHaveLength(0);
    expect(await statusOf(blockId)).toBe('setup');
    expect((await pool.query('select 1 from game_results r join games g on g.id = r.game_id where g.sport_block_id = $1', [blockId])).rowCount).toBe(0);
  });
});
