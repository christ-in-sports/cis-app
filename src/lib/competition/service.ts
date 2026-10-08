/**
 * The sports competition operations behind the Server Actions (ENG-14).
 *
 * Each function takes a Supabase client, so it runs as whoever is signed in:
 * RLS and the `has_role()` checks inside the database functions stay the
 * security boundary (project_spec.md 1.5). The Server Actions in
 * `src/app/sports/actions.ts` authenticate and validate first and then call
 * these; keeping them apart lets the same code be exercised against a real local
 * database in `supabase/tests/competition-actions.test.ts`.
 *
 * What these add on top of the database functions is everything the database
 * cannot know: which teams a division has, the generators in this folder, the
 * per-sport rules for a result, and seeding a knockout from a finished league.
 * Everything that must be atomic -- inserting a whole schedule, recording a
 * result and advancing teams, completing a block -- is a single database
 * function call, never several writes from here (the prototype's several
 * separate writes were how its matches, scores and standings drifted apart).
 *
 * Every function resolves to `{ ok: true, ... }` or `{ ok: false, error }`, the
 * same shape as the registration actions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SaveSportBlockInput, ScheduleGameDayInput } from '@/lib/validation/competition';

import { generateBracket, randomSeeds, validateBracket, type BracketShape } from './bracket';
import {
  assertTeamCount,
  generateLeague,
  MAX_TEAMS,
  MIN_TEAMS,
  type GroupLabel,
  type LeagueStructure,
} from './fixtures';
import {
  bracketToRpc,
  leagueSeeds,
  leagueToRpc,
  placedOnDay,
  toClearItems,
  toScheduleItems,
  toSchedulableGames,
  type LeagueGame,
  type RpcGame,
} from './plan';
import type { Rng } from './rng';
import { scheduleDay } from './scheduler';
import {
  isKnownSport,
  parseDetails,
  resolveWinner,
  sportSettings,
  type SportSettings,
  type Stage,
} from './scores';
import { rankStandings, type StandingsResult, type StandingsTeam } from './standings';

type Db = SupabaseClient;

export type Failure = { ok: false; error: string };
export type Outcome<T extends object = object> = ({ ok: true } & T) | Failure;

type BlockFormat = 'league' | 'knockout' | 'league_knockout';
type BlockStatus = 'setup' | 'league' | 'knockout' | 'completed';

interface BlockRow {
  id: string;
  season_id: string;
  division: 'juniors' | 'ambassadors';
  sport: string;
  format: BlockFormat;
  league_structure: LeagueStructure | null;
  status: BlockStatus;
  settings: SportSettings | null;
}

interface GameRow {
  id: string;
  sport_block_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  stage: Stage;
  round: number;
  status: 'scheduled' | 'completed';
  scheduled_date: string | null;
  group_label: GroupLabel | null;
  winner_to_game_id: string | null;
  loser_to_game_id: string | null;
}

const BLOCK_COLUMNS = 'id, season_id, division, sport, format, league_structure, status, settings';
const GAME_COLUMNS =
  'id, sport_block_id, home_team_id, away_team_id, stage, round, status, scheduled_date, group_label, winner_to_game_id, loser_to_game_id';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** A failure with a message meant for the person using the app. */
class Failed extends Error {}

function bail(message: string): never {
  throw new Failed(message);
}

interface DbError {
  code?: string;
  message: string;
}

/**
 * The database functions raise readable messages for state and input problems
 * (`55000`, `22023`, `P0002`), so those pass through. Anything else is logged
 * and replaced with a generic line, so internals never reach the screen.
 */
export function describeDbError(error: DbError): string {
  switch (error.code) {
    case '42501':
      return 'Only Admin or Program Team can do that.';
    case '55000':
    case '22023':
    case 'P0002':
      return error.message;
    default:
      console.error('competition database error', error);
      return 'Something went wrong. Please try again.';
  }
}

/** Throws if a database call failed. */
function check(error: DbError | null): void {
  if (error) throw new Failed(describeDbError(error));
}

async function guard<T extends object>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof Failed) return { ok: false, error: e.message };
    console.error('competition action failed', e);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadBlock(db: Db, id: string): Promise<BlockRow> {
  const { data, error } = await db.from('sport_blocks').select(BLOCK_COLUMNS).eq('id', id).maybeSingle();
  check(error);
  if (!data) bail('Sport block not found.');
  return data as BlockRow;
}

/** The division's teams for the block's season, the ones that will play. */
async function loadTeams(db: Db, block: BlockRow): Promise<StandingsTeam[]> {
  const { data, error } = await db
    .from('ministry_teams')
    .select('id, name')
    .eq('season_id', block.season_id)
    .eq('division', block.division)
    .eq('active', true)
    .order('name');
  check(error);
  return (data ?? []) as StandingsTeam[];
}

function requireTeamCount(block: BlockRow, teams: readonly StandingsTeam[]): void {
  if (teams.length < MIN_TEAMS || teams.length > MAX_TEAMS) {
    bail(
      `A block needs ${MIN_TEAMS} to ${MAX_TEAMS} active teams, and ${block.division} has ${teams.length} this season.`
    );
  }
}

async function loadGames(db: Db, blockId: string, stage?: Stage): Promise<GameRow[]> {
  let q = db.from('games').select(GAME_COLUMNS).eq('sport_block_id', blockId);
  if (stage) q = q.eq('stage', stage);
  const { data, error } = await q;
  check(error);
  return (data ?? []) as GameRow[];
}

/** The league's games and results, and the teams they involve, ready to rank. */
async function loadLeague(db: Db, blockId: string) {
  const games = await loadGames(db, blockId, 'league');
  const open = games.filter((g) => g.status !== 'completed').length;

  const ids = games.map((g) => g.id);
  const { data: resultRows, error } = ids.length
    ? await db.from('game_results').select('game_id, home_total, away_total').in('game_id', ids)
    : { data: [], error: null };
  check(error);

  const teamIds = [...new Set(games.flatMap((g) => [g.home_team_id!, g.away_team_id!]))];
  const { data: teamRows, error: teamError } = teamIds.length
    ? await db.from('ministry_teams').select('id, name').in('id', teamIds)
    : { data: [], error: null };
  check(teamError);

  const results: StandingsResult[] = (resultRows ?? []).map(
    (r: { game_id: string; home_total: number; away_total: number }) => ({
      gameId: r.game_id,
      homeTotal: r.home_total,
      awayTotal: r.away_total,
    })
  );
  const leagueGames: LeagueGame[] = games.map((g) => ({
    id: g.id,
    home: g.home_team_id!,
    away: g.away_team_id!,
    group: g.group_label,
  }));

  return { games: leagueGames, results, teams: (teamRows ?? []) as StandingsTeam[], open };
}

async function createGames(db: Db, blockId: string, games: readonly RpcGame[]): Promise<number> {
  const { data, error } = await db.rpc('create_sport_block_games', { p_block_id: blockId, p_games: games });
  check(error);
  return data as number;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * Creates a sport block, or edits one when `input.id` is given. Editing the
 * settings, dates or even the name of a block that has games is fine and never
 * touches them; changing its sport, division, season or format is refused by the
 * database once games exist (reset the block first).
 */
export function saveSportBlock(db: Db, input: SaveSportBlockInput) {
  return guard(async () => {
    const values = {
      division: input.division,
      sport: input.sport,
      format: input.format,
      league_structure: input.leagueStructure,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      settings: input.settings,
    };

    const fail = (error: DbError): never => {
      if (error.code === '23505') bail('That sport already has a block for this division this season.');
      if (error.code === '23514') bail('Those block settings are not valid.');
      return bail(describeDbError(error));
    };

    if (input.id) {
      const { data, error } = await db
        .from('sport_blocks')
        .update(values)
        .eq('id', input.id)
        .select('id')
        .maybeSingle();
      if (error) fail(error);
      if (!data) bail('Sport block not found.');
      return { blockId: data!.id as string };
    }

    let seasonId = input.seasonId;
    if (!seasonId) {
      const { data, error } = await db.from('seasons').select('id').eq('is_current', true).limit(1);
      check(error);
      if (!data?.length) bail('There is no current season.');
      seasonId = data![0].id as string;
    }

    const { data, error } = await db
      .from('sport_blocks')
      .insert({ season_id: seasonId, ...values })
      .select('id')
      .single();
    if (error) fail(error);
    return { blockId: data!.id as string };
  });
}

/** Deletes a block's games, results and places and returns it to setup. */
export function resetSportBlock(db: Db, blockId: string) {
  return guard(async () => {
    const { error } = await db.rpc('reset_sport_block', { p_block_id: blockId });
    check(error);
    return {};
  });
}

// ---------------------------------------------------------------------------
// Fixtures and brackets
// ---------------------------------------------------------------------------

/** Creates the league stage of a block that has one: a round-robin, or two groups. */
export function generateLeagueFixtures(db: Db, blockId: string, opts: { rng?: Rng } = {}) {
  return guard(async () => {
    const block = await loadBlock(db, blockId);
    if (block.format === 'knockout') bail('A knockout-only block has no league stage.');
    if (block.status !== 'setup') {
      bail('This block already has games. Reset it to generate them again.');
    }

    const teams = await loadTeams(db, block);
    requireTeamCount(block, teams);
    assertTeamCount(teams.map((t) => t.id));

    const league = generateLeague(
      teams.map((t) => t.id),
      block.league_structure ?? 'round_robin',
      opts.rng
    );
    return { games: await createGames(db, blockId, leagueToRpc(league.fixtures)) };
  });
}

/**
 * Creates the knockout stage. A knockout-only block gets a randomly seeded
 * bracket straight away; a league followed by a knockout waits until every
 * league game has a result and seeds from the final table (for two groups, the
 * two tables woven together so the groups meet in the semi-finals).
 */
export function generateKnockout(db: Db, blockId: string, opts: { rng?: Rng } = {}) {
  return guard(async () => {
    const block = await loadBlock(db, blockId);
    if (block.format === 'league') bail('A league-only block has no knockout stage.');

    let seeds: string[];
    let shape: BracketShape;

    if (block.format === 'knockout') {
      if (block.status !== 'setup') bail('This block already has games. Reset it to generate them again.');
      const teams = await loadTeams(db, block);
      requireTeamCount(block, teams);
      seeds = randomSeeds(
        teams.map((t) => t.id),
        opts.rng
      );
      shape = 'full';
    } else {
      if (block.status === 'setup') bail('Generate the league fixtures first.');
      if (block.status !== 'league') bail('The knockout stage has already been created.');

      const league = await loadLeague(db, blockId);
      if (league.open > 0) {
        bail(
          `${league.open} league game${league.open === 1 ? '' : 's'} still need${league.open === 1 ? 's' : ''} a result before the knockout stage can be created.`
        );
      }
      seeds = leagueSeeds({
        structure: block.league_structure ?? 'round_robin',
        teams: league.teams,
        games: league.games,
        results: league.results,
      });
      shape = 'split';
    }

    const plan = generateBracket({ seeds, shape });
    const problems = validateBracket(plan, seeds.length);
    if (problems.length > 0) {
      console.error('generated an invalid bracket', problems);
      bail('Something went wrong building the bracket. Please try again.');
    }
    return { games: await createGames(db, blockId, bracketToRpc(plan)) };
  });
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Records, or corrects, a game's result. The per-sport detail is checked here
 * (what counts as a valid set or round depends on the sport and the block's
 * limits); the database function does the rest in one transaction: it re-checks
 * the totals, writes the result, and moves the winner and loser into the games
 * they feed.
 */
export function recordResult(
  db: Db,
  input: { gameId: string; details: unknown; tiebreakWinner?: 'home' | 'away' | null }
) {
  return guard(async () => {
    const { data: game, error } = await db
      .from('games')
      .select(GAME_COLUMNS)
      .eq('id', input.gameId)
      .maybeSingle();
    check(error);
    if (!game) bail('Game not found.');
    const row = game as GameRow;

    if (!row.home_team_id || !row.away_team_id) {
      bail('Both teams must be known before a result can be recorded.');
    }

    const block = await loadBlock(db, row.sport_block_id);
    if (!isKnownSport(block.sport)) bail('That sport is not set up yet.');

    const details = parseDetails(block.sport, input.details, block.settings ?? {});
    if (!details.ok) bail(details.error);

    const winner = resolveWinner(row.stage, details.totals, input.tiebreakWinner);
    if (!winner.ok) bail(winner.error);

    const tiebreakTeam = input.tiebreakWinner
      ? input.tiebreakWinner === 'home'
        ? row.home_team_id
        : row.away_team_id
      : null;

    const { error: rpcError } = await db.rpc('record_game_result', {
      p_game_id: input.gameId,
      p_home_total: details.totals.home,
      p_away_total: details.totals.away,
      p_tiebreak_winner: tiebreakTeam,
      p_details: details.details,
    });
    check(rpcError);
    return {};
  });
}

/** Removes a result and takes its teams back out of the games they advanced into. */
export function clearResult(db: Db, gameId: string) {
  return guard(async () => {
    const { error } = await db.rpc('clear_game_result', { p_game_id: gameId });
    check(error);
    return {};
  });
}

/**
 * Closes a block and records each team's final place. A league is placed by its
 * table, ranked here; a knockout is placed by the games that ended each team's
 * run, which the database reads from the bracket.
 */
export function completeSportBlock(db: Db, blockId: string) {
  return guard(async () => {
    const block = await loadBlock(db, blockId);
    if (block.status === 'completed') bail('This block is already completed.');

    let places: string[] | null = null;
    if (block.format === 'league') {
      const league = await loadLeague(db, blockId);
      if (league.games.length === 0) bail('This block has no games yet.');
      if (league.open > 0) {
        bail(`${league.open} game${league.open === 1 ? '' : 's'} still need${league.open === 1 ? 's' : ''} a result.`);
      }
      places = rankStandings(league.teams, league.games, league.results).map((r) => r.teamId);
    }

    const { error } = await db.rpc('complete_sport_block', { p_block_id: blockId, p_places: places });
    check(error);
    return {};
  });
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/**
 * Fills a game day's time slots and courts with the block's unscheduled games.
 *
 * Each slot is one game long (the sport's game length), so `slots` x `courts`
 * cells are available. Courts are shared by every block, so cells already held
 * by any block's games on that date are left alone. Calling it again on the
 * same date only fills what is still free, which is how a knockout bracket
 * drops into open slots once it exists.
 */
export function scheduleGameDay(db: Db, input: ScheduleGameDayInput) {
  return guard(async () => {
    const block = await loadBlock(db, input.blockId);
    if (block.status === 'completed') bail('This block is completed. Reset it to change the schedule.');
    if (!isKnownSport(block.sport)) bail('That sport is not set up yet.');
    const gameMinutes = sportSettings(block.sport, block.settings ?? {}).gameMinutes ?? 20;

    const blockGames = await loadGames(db, input.blockId);
    const { data: dayRows, error } = await db
      .from('games')
      .select('id, home_team_id, away_team_id, scheduled_time, court')
      .eq('scheduled_date', input.date);
    check(error);

    const grid = { startTime: input.startTime, gameMinutes, slots: input.slots, courts: input.courts };
    const placed = placedOnDay(dayRows ?? [], grid);

    const toPlace = new Set(
      blockGames.filter((g) => g.status === 'scheduled' && !g.scheduled_date).map((g) => g.id)
    );
    // Feeders come from all of the block's games, since a feeder already played
    // or scheduled elsewhere still shapes what the scheduler may do.
    const games = toSchedulableGames(blockGames).filter((g) => toPlace.has(g.id));

    const result = scheduleDay({ slots: input.slots, courts: input.courts, games, placed });
    if (result.assignments.length > 0) {
      const items = toScheduleItems(result.assignments, {
        date: input.date,
        startTime: input.startTime,
        gameMinutes,
      });
      const { error: rpcError } = await db.rpc('set_game_schedule', { p_items: items });
      check(rpcError);
    }

    return {
      placed: result.assignments.length,
      unplaced: result.unplaced.length,
      openCells: result.openCells,
    };
  });
}

/**
 * Takes the block's unplayed games off a game day. Games already played keep
 * their date, time and court, because that is where and when they were played;
 * their results are never touched.
 */
export function clearGameDay(db: Db, blockId: string, date: string) {
  return guard(async () => {
    const { data, error } = await db
      .from('games')
      .select('id')
      .eq('sport_block_id', blockId)
      .eq('scheduled_date', date)
      .eq('status', 'scheduled');
    check(error);

    const ids = (data ?? []).map((g: { id: string }) => g.id);
    if (ids.length > 0) {
      const { error: rpcError } = await db.rpc('set_game_schedule', { p_items: toClearItems(ids) });
      check(rpcError);
    }
    return { cleared: ids.length };
  });
}
