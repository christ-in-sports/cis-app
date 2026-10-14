/**
 * Reading what the Sports screens show.
 *
 * Every read runs as the signed-in user, so RLS decides what comes back: any role
 * may read a season's blocks, games and results, and a user with no role gets
 * nothing (project_spec.md 1.5). Nothing here uses a service key.
 *
 * A season has a few dozen games per block and eight blocks at most, so a screen
 * loads the whole season in a handful of queries rather than paging. The one
 * thing kept short is the URL: results are fetched through their game with a join
 * on the block, never by listing hundreds of game ids.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DIVISION_ORDER } from './labels';
import type {
  BlockRecord,
  Division,
  GameRecord,
  PlaceRecord,
  ResultRecord,
  TeamRecord,
} from './types';

type Db = SupabaseClient;

export interface SeasonRecord {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
}

export interface SportsData {
  season: SeasonRecord | null;
  blocks: BlockRecord[];
  teams: TeamRecord[];
  games: GameRecord[];
  results: ResultRecord[];
  places: PlaceRecord[];
  /** The teams this viewer cares about: their kids' teams, or the ones they coach. */
  myTeamIds: string[];
  /** When this was read, for the "Updated" note. */
  readAt: string;
}

const BLOCK_COLUMNS =
  'id, season_id, division, sport, format, league_structure, status, starts_on, ends_on, settings';
const GAME_COLUMNS =
  'id, sport_block_id, home_team_id, away_team_id, stage, group_label, round, label, scheduled_date, scheduled_time, court, status, winner_to_game_id, winner_to_slot, loser_to_game_id, loser_to_slot, winner_place, loser_place';
const RESULT_COLUMNS =
  'game_id, home_total, away_total, winner_team_id, tiebreak_winner_team_id, recorded_by, recorded_at, details';

/** A failed read becomes an error the page's error boundary shows, never a half-empty screen. */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return res.data ?? ([] as unknown as T);
}

export async function loadSportsData(db: Db, userId: string): Promise<SportsData> {
  const { data: seasons, error: seasonError } = await db
    .from('seasons')
    .select('id, name, starts_on, ends_on')
    .eq('is_current', true)
    .limit(1);
  if (seasonError) throw new Error(`Could not load the season: ${seasonError.message}`);
  const season = (seasons?.[0] as SeasonRecord | undefined) ?? null;

  const empty: SportsData = {
    season,
    blocks: [],
    teams: [],
    games: [],
    results: [],
    places: [],
    myTeamIds: [],
    readAt: new Date().toISOString(),
  };
  if (!season) return empty;

  const [blocksRes, teamsRes] = await Promise.all([
    db.from('sport_blocks').select(BLOCK_COLUMNS).eq('season_id', season.id).order('starts_on', { nullsFirst: false }),
    db.from('ministry_teams').select('id, name, division').eq('season_id', season.id).order('name'),
  ]);
  const blocks = must<BlockRecord[]>(blocksRes, 'sport blocks');
  const teams = must<TeamRecord[]>(teamsRes, 'teams');

  const blockIds = blocks.map((b) => b.id);
  const [gamesRes, resultsRes, placesRes, coachRes, kidsRes] = await Promise.all([
    blockIds.length
      ? db.from('games').select(GAME_COLUMNS).in('sport_block_id', blockIds)
      : Promise.resolve({ data: [], error: null }),
    blockIds.length
      ? db
          .from('game_results')
          .select(`${RESULT_COLUMNS}, games!inner(sport_block_id)`)
          .in('games.sport_block_id', blockIds)
      : Promise.resolve({ data: [], error: null }),
    blockIds.length
      ? db.from('sport_block_places').select('sport_block_id, team_id, place').in('sport_block_id', blockIds)
      : Promise.resolve({ data: [], error: null }),
    // Teams the viewer coaches. Readable only by a coach or Admin, so anyone else gets none.
    db.from('team_coaches').select('team_id').eq('user_id', userId),
    // Teams their own kids are on this season.
    db
      .from('registrations')
      .select('team_id, kids!inner(parent_user_id)')
      .eq('season_id', season.id)
      .eq('kids.parent_user_id', userId)
      .not('team_id', 'is', null),
  ]);

  // The join on `games` is only there to filter by block; keep just the result.
  const results = must<ResultRecord[]>(resultsRes, 'results').map((r) => ({
    game_id: r.game_id,
    home_total: r.home_total,
    away_total: r.away_total,
    winner_team_id: r.winner_team_id,
    tiebreak_winner_team_id: r.tiebreak_winner_team_id,
    recorded_by: r.recorded_by,
    recorded_at: r.recorded_at,
    details: r.details,
  }));

  const mine = new Set<string>();
  for (const r of (coachRes.data ?? []) as { team_id: string }[]) mine.add(r.team_id);
  for (const r of (kidsRes.data ?? []) as { team_id: string | null }[]) if (r.team_id) mine.add(r.team_id);

  return {
    season,
    blocks,
    teams,
    games: must<GameRecord[]>(gamesRes, 'games'),
    results,
    places: must<PlaceRecord[]>(placesRes, 'final places'),
    myTeamIds: [...mine],
    readAt: empty.readAt,
  };
}

// ---------------------------------------------------------------------------
// Which division and block to show
// ---------------------------------------------------------------------------

const ACTIVE = new Set(['league', 'knockout']);

/** Blocks of one division in the order the screens list them. */
export function blocksInDivision(blocks: readonly BlockRecord[], division: Division): BlockRecord[] {
  return blocks
    .filter((b) => b.division === division)
    .sort(
      (a, b) =>
        (a.starts_on ?? '9999').localeCompare(b.starts_on ?? '9999') || a.sport.localeCompare(b.sport)
    );
}

function isDivision(value: string | undefined): value is Division {
  return (DIVISION_ORDER as readonly string[]).includes(value ?? '');
}

/**
 * The division to show: the one in the URL; else the division of the viewer's own
 * team; else the first division that has a block; else Juniors.
 */
export function pickDivision(opts: {
  requested?: string;
  blocks: readonly BlockRecord[];
  teams: readonly TeamRecord[];
  myTeamIds: readonly string[];
}): Division {
  if (isDivision(opts.requested)) return opts.requested;
  const mine = opts.teams.find((t) => opts.myTeamIds.includes(t.id));
  if (mine) return mine.division;
  return DIVISION_ORDER.find((d) => opts.blocks.some((b) => b.division === d)) ?? 'juniors';
}

/**
 * The block to show: the one in the URL if it is in this division; else the one
 * being played now; else the most recent; else none.
 */
export function pickBlock(
  inDivision: readonly BlockRecord[],
  requested?: string
): BlockRecord | null {
  if (inDivision.length === 0) return null;
  return (
    inDivision.find((b) => b.id === requested) ??
    inDivision.find((b) => ACTIVE.has(b.status)) ??
    [...inDivision].reverse().find((b) => b.status === 'completed') ??
    inDivision[0]
  );
}
