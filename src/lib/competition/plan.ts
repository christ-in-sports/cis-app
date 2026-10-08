/**
 * Glue between the pure competition library and the database.
 *
 * The generators (`fixtures.ts`, `bracket.ts`) and the scheduler speak in their
 * own shapes; `create_sport_block_games()` and `set_game_schedule()` take JSON
 * with snake_case keys. This is the one place that converts between them, plus
 * the few decisions that sit between "the league is finished" and "here is the
 * bracket" (who is seed 1?) and between "these games need a time" and "here are
 * the cells already taken". Everything here is pure, so it is unit-tested
 * without a database.
 */

import type { PlanGame, Slot } from './bracket';
import type { GroupLabel, LeagueFixture, LeagueStructure } from './fixtures';
import type { PlacedGame, SchedulableGame, Assignment } from './scheduler';
import { slotTime } from './scheduler';
import type { Stage } from './scores';
import { rankStandings, type StandingsGame, type StandingsResult, type StandingsTeam } from './standings';

// ---------------------------------------------------------------------------
// Games -> create_sport_block_games()
// ---------------------------------------------------------------------------

/** One game as `create_sport_block_games()` reads it. */
export interface RpcGame {
  key: string;
  stage: Stage;
  round: number;
  label: string;
  group_label?: GroupLabel | null;
  home_team_id: string | null;
  away_team_id: string | null;
  winner_to?: { key: string; slot: Slot };
  loser_to?: { key: string; slot: Slot };
  winner_place?: number;
  loser_place?: number;
}

export function leagueToRpc(fixtures: readonly LeagueFixture[]): RpcGame[] {
  return fixtures.map((f, i) => ({
    key: `L${i + 1}`,
    stage: 'league',
    round: f.round,
    label: `Round ${f.round}`,
    group_label: f.group,
    home_team_id: f.home,
    away_team_id: f.away,
  }));
}

export function bracketToRpc(plan: readonly PlanGame[]): RpcGame[] {
  return plan.map((g) => ({
    key: g.key,
    stage: g.stage,
    round: g.round,
    label: g.label,
    home_team_id: g.home,
    away_team_id: g.away,
    ...(g.winnerTo && { winner_to: g.winnerTo }),
    ...(g.loserTo && { loser_to: g.loserTo }),
    ...(g.winnerPlace !== undefined && { winner_place: g.winnerPlace }),
    ...(g.loserPlace !== undefined && { loser_place: g.loserPlace }),
  }));
}

// ---------------------------------------------------------------------------
// Seeding a knockout from a finished league
// ---------------------------------------------------------------------------

export interface LeagueGame extends StandingsGame {
  group: GroupLabel | null;
}

/**
 * `[A1, B1, A2, B2, ...]`: the two groups' tables woven together, so seeds 1 and
 * 4 (and 2 and 3) are always from different groups and the semi-finals are
 * A1 v B2 and B1 v A2. The first group is the larger when sizes differ (4 + 3).
 */
export function interleaveGroups(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * Teams best first, from the finished league: one table for a round-robin, or
 * each group's own table woven together for a league played in two groups.
 */
export function leagueSeeds(opts: {
  structure: LeagueStructure;
  teams: readonly StandingsTeam[];
  games: readonly LeagueGame[];
  results: readonly StandingsResult[];
}): string[] {
  const { structure, teams, games, results } = opts;

  if (structure === 'round_robin') {
    return rankStandings(teams, games, results).map((r) => r.teamId);
  }

  const tableOf = (label: GroupLabel): string[] => {
    const inGroup = games.filter((g) => g.group === label);
    const ids = new Set(inGroup.flatMap((g) => [g.home, g.away]));
    return rankStandings(
      teams.filter((t) => ids.has(t.id)),
      inGroup,
      results
    ).map((r) => r.teamId);
  };
  return interleaveGroups(tableOf('A'), tableOf('B'));
}

// ---------------------------------------------------------------------------
// Scheduling a game day
// ---------------------------------------------------------------------------

export interface ScheduleGameRow {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  stage: Stage;
  round: number;
  winner_to_game_id: string | null;
  loser_to_game_id: string | null;
}

/** Games for the scheduler, each knowing which games feed it. */
export function toSchedulableGames(rows: readonly ScheduleGameRow[]): SchedulableGame[] {
  const feeders = new Map<string, string[]>();
  for (const r of rows) {
    for (const target of [r.winner_to_game_id, r.loser_to_game_id]) {
      if (target) feeders.set(target, [...(feeders.get(target) ?? []), r.id]);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    home: r.home_team_id,
    away: r.away_team_id,
    stage: r.stage,
    round: r.round,
    feeders: feeders.get(r.id) ?? [],
    // Within a round, the main bracket goes before the placement games.
    order: r.stage === 'placement' ? 1 : 0,
  }));
}

/** Minutes after midnight for "HH:MM" or Postgres's "HH:MM:SS". */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Which 1-based slot of a game day a clock time falls on, or null if it is not a
 * slot start (a different game length, or outside the day).
 */
export function slotOfTime(
  startTime: string,
  time: string,
  gameMinutes: number,
  slots: number
): number | null {
  const offset = toMinutes(time) - toMinutes(startTime);
  if (offset < 0 || offset % gameMinutes !== 0) return null;
  const slot = offset / gameMinutes + 1;
  return slot <= slots ? slot : null;
}

export interface DayGameRow {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  scheduled_time: string | null;
  court: number | null;
}

/**
 * The cells of this game day that other games already hold, whichever block they
 * belong to: courts are shared, so a Juniors game at 2:00 on court 1 blocks that
 * cell for an Ambassadors game too. A game whose time is not a slot start of this
 * day's grid cannot be mapped onto it and is ignored.
 */
export function placedOnDay(
  rows: readonly DayGameRow[],
  grid: { startTime: string; gameMinutes: number; slots: number; courts: number }
): PlacedGame[] {
  return rows.flatMap((r) => {
    if (!r.scheduled_time || !r.court || r.court > grid.courts) return [];
    const slot = slotOfTime(grid.startTime, r.scheduled_time, grid.gameMinutes, grid.slots);
    if (slot === null) return [];
    return [{ id: r.id, home: r.home_team_id, away: r.away_team_id, slot, court: r.court }];
  });
}

/** One entry of `set_game_schedule()`'s input. */
export interface ScheduleItem {
  game_id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  court: number | null;
}

export function toScheduleItems(
  assignments: readonly Assignment[],
  day: { date: string; startTime: string; gameMinutes: number }
): ScheduleItem[] {
  return assignments.map((a) => ({
    game_id: a.gameId,
    scheduled_date: day.date,
    scheduled_time: slotTime(day.startTime, a.slot, day.gameMinutes),
    court: a.court,
  }));
}

/** Items that take games off the schedule (nulls unschedule). */
export function toClearItems(gameIds: readonly string[]): ScheduleItem[] {
  return gameIds.map((game_id) => ({ game_id, scheduled_date: null, scheduled_time: null, court: null }));
}
