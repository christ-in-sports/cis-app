/**
 * League fixtures: who plays whom, and in which round.
 *
 * Ported from the prototype (`src/lib/fixtures.ts` at b4a77a6), which used the
 * circle method. What changed: fair shuffling (`rng.ts`), home/away balanced
 * across rounds, groups sized for 6 to 8 teams, and one `LeagueFixture` shape
 * for both structures.
 *
 * A division has 6 to 8 teams. A league is either a full round-robin, or two
 * groups played as round-robins; the admin picks per sport block because a full
 * round-robin of 8 teams is 7 rounds, which may not fit a 3-4 week block.
 */

import { shuffle, type Rng } from './rng';

export const MIN_TEAMS = 6;
export const MAX_TEAMS = 8;

export const LEAGUE_STRUCTURES = ['round_robin', 'groups'] as const;
export type LeagueStructure = (typeof LEAGUE_STRUCTURES)[number];

export type GroupLabel = 'A' | 'B';

export interface LeagueFixture {
  home: string;
  away: string;
  /** 1-based round; round N of group A and of group B are played together. */
  round: number;
  group: GroupLabel | null;
}

export interface League {
  /** Team ids per group, in draw order; null for a full round-robin. */
  groups: Record<GroupLabel, string[]> | null;
  fixtures: LeagueFixture[];
}

export function assertTeamCount(teamIds: readonly string[]): void {
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error('Team ids must be distinct');
  }
  if (teamIds.length < MIN_TEAMS || teamIds.length > MAX_TEAMS) {
    throw new Error(`A division needs ${MIN_TEAMS} to ${MAX_TEAMS} teams, got ${teamIds.length}`);
  }
}

/**
 * Every pair once, using the circle method. With an odd number of teams one
 * team sits out each round (a bye).
 *
 * The first team stays put and the rest rotate, so on its own that team would
 * be home every round. Flipping that one pairing on alternate rounds keeps home
 * and away roughly even for everyone.
 */
export function roundRobin(teamIds: readonly string[]): { home: string; away: string; round: number }[] {
  const BYE = null;
  const teams: (string | null)[] = [...teamIds];
  if (teams.length % 2 !== 0) teams.push(BYE);

  const n = teams.length;
  const fixtures: { home: string; away: string; round: number }[] = [];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      let home = teams[i];
      let away = teams[n - 1 - i];
      if (home === BYE || away === BYE) continue;
      if (i === 0 && round % 2 === 1) [home, away] = [away, home];
      fixtures.push({ home: home!, away: away!, round: round + 1 });
    }
    // Keep the first team fixed and rotate the rest.
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  return fixtures;
}

/** Splits shuffled teams into two groups: 6 -> 3+3, 7 -> 4+3, 8 -> 4+4. */
export function drawGroups(teamIds: readonly string[], rng?: Rng): Record<GroupLabel, string[]> {
  assertTeamCount(teamIds);
  const shuffled = shuffle(teamIds, rng);
  const sizeA = Math.ceil(shuffled.length / 2);
  return { A: shuffled.slice(0, sizeA), B: shuffled.slice(sizeA) };
}

export function generateLeague(
  teamIds: readonly string[],
  structure: LeagueStructure,
  rng?: Rng
): League {
  assertTeamCount(teamIds);

  if (structure === 'round_robin') {
    return {
      groups: null,
      fixtures: roundRobin(shuffle(teamIds, rng)).map((f) => ({ ...f, group: null })),
    };
  }

  const groups = drawGroups(teamIds, rng);
  const fixtures: LeagueFixture[] = (['A', 'B'] as const).flatMap((group) =>
    roundRobin(groups[group]).map((f) => ({ ...f, group }))
  );
  return { groups, fixtures };
}
