/**
 * The logic behind the score entry screen, kept out of the components so it can
 * be tested: how each sport's detail changes when a button is tapped, what the
 * running total is, which sets or rounds are still needed, what a level knockout
 * game asks, and what a correction or a clear would touch downstream.
 *
 * Nothing here is a permission or a validity rule. `parseDetails` and the
 * database functions decide what may be saved; this only shapes what is on screen.
 */

import { parseDetails, emptyDetails, type Side, type SportSettings, type Totals } from './scores';
import type { GameRecord, ResultRecord, TeamRecord } from './types';

export interface PointsDetails {
  home: number;
  away: number;
}
export interface SetsDetails {
  sets: { home: number; away: number }[];
}
export interface RoundsDetails {
  rounds: { winner: Side | null }[];
}

const MAX_POINTS = 999;

/** The details to start the sheet from: the saved result, or an empty game. */
export function startingDetails(sport: string, settings: SportSettings, saved: ResultRecord | undefined): unknown {
  if (saved) {
    const parsed = parseDetails(sport, saved.details, settings);
    if (parsed.ok) return parsed.details;
  }
  return emptyDetails(sport, settings);
}

/** Soccer and basketball: add or take off points for one side. Never below 0. */
export function bump(details: PointsDetails, side: Side, delta: number): PointsDetails {
  const next = Math.min(MAX_POINTS, Math.max(0, details[side] + delta));
  return { ...details, [side]: next };
}

/** Volleyball: add or take off points in one set. */
export function bumpSet(details: SetsDetails, index: number, side: Side, delta: number): SetsDetails {
  return {
    sets: details.sets.map((s, i) =>
      i === index ? { ...s, [side]: Math.min(MAX_POINTS, Math.max(0, s[side] + delta)) } : s
    ),
  };
}

/** Dodgeball: tap a name to record the round, tap it again to clear it. */
export function pickRound(details: RoundsDetails, index: number, side: Side): RoundsDetails {
  return {
    rounds: details.rounds.map((r, i) => (i === index ? { winner: r.winner === side ? null : side } : r)),
  };
}

/** Totals for what is on screen, or null while the details are not valid yet. */
export function entryTotals(sport: string, details: unknown, settings: SportSettings): Totals | null {
  const parsed = parseDetails(sport, details, settings);
  return parsed.ok ? parsed.totals : null;
}

/** Sets or rounds to win a best-of series: 3 of 5, 2 of 3. */
export function winsNeeded(count: number): number {
  return Math.floor(count / 2) + 1;
}

/**
 * How many sets or rounds are still in play. Once a side has won the series the
 * rest are "not needed" (and are dropped before saving).
 */
export function neededCount(wins: (Side | null)[]): number {
  const total = wins.length;
  const need = winsNeeded(total);
  const tally = { home: 0, away: 0 };
  for (let i = 0; i < total; i++) {
    const w = wins[i];
    if (w) tally[w]++;
    if (tally.home >= need || tally.away >= need) return i + 1;
  }
  return total;
}

export function setWinners(details: SetsDetails): (Side | null)[] {
  return details.sets.map((s) => (s.home > s.away ? 'home' : s.away > s.home ? 'away' : null));
}

export function roundWinners(details: RoundsDetails): (Side | null)[] {
  return details.rounds.map((r) => r.winner);
}

/** The set the point steppers are editing by default: the first one not played, else the last needed. */
export function defaultActiveSet(details: SetsDetails): number {
  const needed = neededCount(setWinners(details));
  const unplayed = details.sets.findIndex((s, i) => i < needed && s.home === 0 && s.away === 0);
  return unplayed === -1 ? needed - 1 : unplayed;
}

/** Trims sets and rounds that were never needed, so the saved detail holds only real play. */
export function trimDetails(sport: string, details: unknown): unknown {
  if (sport === 'volleyball') {
    const d = details as SetsDetails;
    const needed = neededCount(setWinners(d));
    const played = d.sets.slice(0, needed).filter((s) => s.home !== 0 || s.away !== 0);
    return { sets: played.length > 0 ? played : d.sets.slice(0, 1) };
  }
  if (sport === 'dodgeball') {
    const d = details as RoundsDetails;
    const needed = neededCount(roundWinners(d));
    const played = d.rounds.slice(0, needed).filter((r) => r.winner !== null);
    return { rounds: played.length > 0 ? played : d.rounds.slice(0, 1) };
  }
  return details;
}

export function isLevel(totals: Totals | null): boolean {
  return totals !== null && totals.home === totals.away;
}

/** What a level knockout game asks, by sport. */
export function tiebreakAsk(sport: string): string {
  switch (sport) {
    case 'soccer':
      return 'Who won the penalty shootout?';
    case 'basketball':
      return 'Who won in overtime?';
    case 'dodgeball':
      return 'Who won the extra round?';
    case 'volleyball':
      return 'Who won the deciding set?';
    default:
      return 'Who won the tiebreak?';
  }
}

/** Short word for the error under the picker: "a shootout", "overtime". */
export function tiebreakWord(sport: string): string {
  switch (sport) {
    case 'soccer':
      return 'the penalty shootout';
    case 'basketball':
      return 'overtime';
    case 'dodgeball':
      return 'the extra round';
    default:
      return 'the tiebreak';
  }
}

// ---------------------------------------------------------------------------
// Downstream effects
// ---------------------------------------------------------------------------

const teamName = (teams: ReadonlyMap<string, TeamRecord>, id: string | null) =>
  (id && teams.get(id)?.name) || 'A team';

/** Who is in a game's slot. */
function occupant(game: GameRecord, slot: 'home' | 'away'): string | null {
  return slot === 'home' ? game.home_team_id : game.away_team_id;
}

export interface Downstream {
  game: GameRecord;
  /** The team this game put there: its winner or its loser. */
  teamId: string | null;
  as: 'winner' | 'loser';
}

/** The games this one feeds, with whoever is currently in the slot it fills. */
export function downstreamOf(game: GameRecord, games: readonly GameRecord[]): Downstream[] {
  const out: Downstream[] = [];
  const winnerTarget = games.find((g) => g.id === game.winner_to_game_id);
  if (winnerTarget && game.winner_to_slot) {
    out.push({ game: winnerTarget, teamId: occupant(winnerTarget, game.winner_to_slot), as: 'winner' });
  }
  const loserTarget = games.find((g) => g.id === game.loser_to_game_id);
  if (loserTarget && game.loser_to_slot) {
    out.push({ game: loserTarget, teamId: occupant(loserTarget, game.loser_to_slot), as: 'loser' });
  }
  return out;
}

/**
 * The already-played game that stops this result being changed to `newWinner`,
 * or null. Mirrors `record_game_result`: a correction is blocked only when it
 * would swap a team in a game that has already been played. A score change that
 * keeps the same winner and loser is always fine.
 */
export function blockingGame(
  game: GameRecord,
  games: readonly GameRecord[],
  saved: ResultRecord | undefined,
  newWinnerSide: Side | null
): GameRecord | null {
  if (!saved || newWinnerSide === null || !game.home_team_id || !game.away_team_id) return null;
  const winner = newWinnerSide === 'home' ? game.home_team_id : game.away_team_id;
  const loser = newWinnerSide === 'home' ? game.away_team_id : game.home_team_id;
  for (const d of downstreamOf(game, games)) {
    const wanted = d.as === 'winner' ? winner : loser;
    if (d.game.status === 'completed' && d.teamId !== wanted) return d.game;
  }
  return null;
}

/** Any played game this one feeds: the reason a clear is refused. */
export function playedDownstream(game: GameRecord, games: readonly GameRecord[]): GameRecord | null {
  return downstreamOf(game, games).find((d) => d.game.status === 'completed')?.game ?? null;
}

/** The lines under "What changes after that" on the clear confirmation. */
export function clearImpact(
  game: GameRecord,
  games: readonly GameRecord[],
  teams: ReadonlyMap<string, TeamRecord>
): string[] {
  const lines: string[] = [];
  for (const d of downstreamOf(game, games)) {
    if (d.teamId) {
      lines.push(`${teamName(teams, d.teamId)} leave ${d.game.label} and go back to waiting for ${game.label}`);
    }
  }
  lines.push(`${game.label} goes back to upcoming and can be scored again`);
  return lines;
}

/**
 * The next game to score after this one: another game in the same time slot if
 * one is still unplayed (on any court, since games in a slot finish together and
 * are scored together), otherwise the first game of the next slot. Only games
 * with both teams known are offered, since a waiting game cannot be scored.
 */
export function nextToScore(game: GameRecord, games: readonly GameRecord[]): GameRecord | null {
  if (!game.scheduled_date || !game.scheduled_time) return null;
  const at = `${game.scheduled_date} ${game.scheduled_time}`;
  const when = (g: GameRecord) => `${g.scheduled_date} ${g.scheduled_time}`;
  const upcoming = games
    .filter(
      (g) =>
        g.id !== game.id &&
        g.status !== 'completed' &&
        g.scheduled_date !== null &&
        g.scheduled_time !== null &&
        g.home_team_id !== null &&
        g.away_team_id !== null &&
        when(g) >= at
    )
    .sort((a, b) => when(a).localeCompare(when(b)) || (a.court ?? 0) - (b.court ?? 0));
  return upcoming[0] ?? null;
}

/** Whether a game can be scored at all: both teams known and its block still open to it. */
export function scoreable(game: GameRecord, blockStatus: string): boolean {
  if (!game.home_team_id || !game.away_team_id) return false;
  if (blockStatus === 'completed') return false;
  if (game.stage === 'league' && blockStatus !== 'league') return false;
  return true;
}
