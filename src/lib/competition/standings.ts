/**
 * League tables, calculated from results and never stored.
 *
 * Ported from the prototype's `recalculateStandings` (match-card.tsx at
 * b4a77a6). What changed: the table is a pure function of the games and results
 * (so it can be recomputed on every Realtime update), and ties are broken with
 * a mini-league among only the tied teams. The prototype compared two teams at a
 * time, which is not transitive -- with a three-way cycle (A beat B, B beat C,
 * C beat A) the order depended on the order the teams happened to arrive in.
 *
 * Win 3, draw 1, loss 0.
 */

export interface StandingsTeam {
  id: string;
  name: string;
}

export interface StandingsGame {
  id: string;
  home: string;
  away: string;
}

export interface StandingsResult {
  gameId: string;
  homeTotal: number;
  awayTotal: number;
}

export interface StandingsRow {
  teamId: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  difference: number;
  points: number;
}

/**
 * Which tie-break comes first after points.
 *
 * `head_to_head_first`: points, head-to-head, difference, scored.
 * `difference_first`: points, difference, head-to-head, scored (the prototype's
 * order). Open question for the Director; both finish with the team name.
 */
export type TieBreakOrder = 'head_to_head_first' | 'difference_first';

export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;

type Stats = Omit<StandingsRow, 'rank'>;

const emptyStats = (teamId: string): Stats => ({
  teamId,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  scored: 0,
  conceded: 0,
  difference: 0,
  points: 0,
});

/** Totals each team's record over the games that have a result. */
function tally(
  teamIds: readonly string[],
  games: readonly StandingsGame[],
  results: readonly StandingsResult[]
): Map<string, Stats> {
  const stats = new Map(teamIds.map((id) => [id, emptyStats(id)]));
  const resultByGame = new Map(results.map((r) => [r.gameId, r]));

  for (const game of games) {
    const result = resultByGame.get(game.id);
    const home = stats.get(game.home);
    const away = stats.get(game.away);
    if (!result || !home || !away) continue;

    home.played++;
    away.played++;
    home.scored += result.homeTotal;
    home.conceded += result.awayTotal;
    away.scored += result.awayTotal;
    away.conceded += result.homeTotal;

    if (result.homeTotal === result.awayTotal) {
      home.drawn++;
      away.drawn++;
      home.points += DRAW_POINTS;
      away.points += DRAW_POINTS;
    } else if (result.homeTotal > result.awayTotal) {
      home.won++;
      away.lost++;
      home.points += WIN_POINTS;
    } else {
      away.won++;
      home.lost++;
      away.points += WIN_POINTS;
    }
  }

  for (const s of stats.values()) s.difference = s.scored - s.conceded;
  return stats;
}

type Key = number[];

const compareKeys = (a: Key, b: Key) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
};

/** Splits teams into groups of equal key, best group first. */
function splitBy(ids: string[], keyOf: (id: string) => Key): string[][] {
  const sorted = [...ids].sort((a, b) => compareKeys(keyOf(a), keyOf(b)));
  const groups: string[][] = [];
  for (const id of sorted) {
    const last = groups[groups.length - 1];
    if (last && compareKeys(keyOf(last[0]), keyOf(id)) === 0) last.push(id);
    else groups.push([id]);
  }
  return groups;
}

export function rankStandings(
  teams: readonly StandingsTeam[],
  games: readonly StandingsGame[],
  results: readonly StandingsResult[],
  order: TieBreakOrder = 'head_to_head_first'
): StandingsRow[] {
  const ids = teams.map((t) => t.id);
  const overall = tally(ids, games, results);
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));

  /** A mini-league among only `cluster`: points, then difference, then scored. */
  const headToHead = (cluster: string[]): ((id: string) => Key) => {
    const inCluster = new Set(cluster);
    const mini = tally(
      cluster,
      games.filter((g) => inCluster.has(g.home) && inCluster.has(g.away)),
      results
    );
    return (id) => {
      const s = mini.get(id)!;
      return [s.points, s.difference, s.scored];
    };
  };

  type Step =
    | { kind: 'h2h' }
    | { kind: 'overall'; key: (id: string) => Key };

  const difference: Step = { kind: 'overall', key: (id) => [overall.get(id)!.difference] };
  const h2h: Step = { kind: 'h2h' };
  const scored: Step = { kind: 'overall', key: (id) => [overall.get(id)!.scored] };
  const steps: Step[] = order === 'head_to_head_first' ? [h2h, difference, scored] : [difference, h2h, scored];

  const byName = (a: string, b: string) =>
    nameOf.get(a)!.localeCompare(nameOf.get(b)!) || a.localeCompare(b);

  /** Orders a cluster tied on everything so far, applying `remaining` steps in turn. */
  const resolve = (cluster: string[], remaining: Step[]): string[] => {
    if (cluster.length === 1) return cluster;
    if (remaining.length === 0) return [...cluster].sort(byName);

    const [step, ...rest] = remaining;
    const keyOf = step.kind === 'h2h' ? headToHead(cluster) : step.key;
    const groups = splitBy(cluster, keyOf);

    if (groups.length === 1) return resolve(cluster, rest);
    // After head-to-head splits a cluster, the smaller clusters it leaves get a
    // fresh head-to-head among just themselves.
    return groups.flatMap((g) => resolve(g, step.kind === 'h2h' ? remaining : rest));
  };

  const ordered = splitBy(ids, (id) => [overall.get(id)!.points]).flatMap((g) => resolve(g, steps));

  return ordered.map((id, i) => ({ ...overall.get(id)!, rank: i + 1 }));
}

/** One team's final place in a completed block. */
export interface Placing {
  teamId: string;
  place: number;
}

/** A game that ended a team's run in a bracket, with who won and lost. */
export interface TerminalOutcome {
  winnerPlace?: number;
  loserPlace?: number;
  winnerTeamId: string | null;
  loserTeamId: string | null;
}

/**
 * Every team's final place, once a block is finished.
 *
 * A league is placed by its table. A knockout (with or without a league first)
 * is placed by the games that ended each team's run. Throws unless every team
 * gets exactly one place 1..N, so a half-finished block can't be completed.
 */
export function finalPlaces(
  block:
    | { format: 'league'; table: readonly Pick<StandingsRow, 'teamId'>[] }
    | { format: 'knockout' | 'league_knockout'; outcomes: readonly TerminalOutcome[] }
): Placing[] {
  const placings: Placing[] =
    block.format === 'league'
      ? block.table.map((row, i) => ({ teamId: row.teamId, place: i + 1 }))
      : block.outcomes.flatMap((o) => {
          const out: Placing[] = [];
          if (o.winnerPlace !== undefined) {
            if (!o.winnerTeamId) throw new Error('A finished game has no winner');
            out.push({ teamId: o.winnerTeamId, place: o.winnerPlace });
          }
          if (o.loserPlace !== undefined) {
            if (!o.loserTeamId) throw new Error('A finished game has no loser');
            out.push({ teamId: o.loserTeamId, place: o.loserPlace });
          }
          return out;
        });

  const sorted = [...placings].sort((a, b) => a.place - b.place);
  const teams = new Set(sorted.map((p) => p.teamId));
  if (teams.size !== sorted.length || sorted.some((p, i) => p.place !== i + 1)) {
    throw new Error('Final places are incomplete or repeated');
  }
  return sorted;
}
