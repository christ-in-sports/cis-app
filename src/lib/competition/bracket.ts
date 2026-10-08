/**
 * Knockout brackets as an explicit graph.
 *
 * Every game says where its winner and its loser go next (`winnerTo` /
 * `loserTo`), or, for a game that ends a team's run, which final place each
 * earns (`winnerPlace` / `loserPlace`). The prototype guessed the next game
 * from round and bracket names, which put the 5th-place winner into the Final
 * for 6 teams, never filled the 5th-8th games for an 8-team knockout, and
 * supported only 6 and 8 teams. Here every team finishes with a place 1..N.
 *
 * Byes are not fake games: a team that skips round 1 is written straight into
 * its next game, so that game has one team at generation time and waits for the
 * other.
 *
 * Seeds are team ids ordered best first. For a league followed by a knockout
 * (`split`), they come from the league table -- for two groups, interleaved
 * `[A1, B1, A2, B2, ...]` so the semi-finals are A1 v B2 and B1 v A2. For a
 * knockout only (`full`), use `randomSeeds`.
 */

import { shuffle, type Rng } from './rng';
import { MAX_TEAMS, MIN_TEAMS } from './fixtures';

export type Slot = 'home' | 'away';
export type BracketShape = 'full' | 'split';
export type BracketStage = 'knockout' | 'placement';

export interface Exit {
  key: string;
  slot: Slot;
}

export interface PlanGame {
  /** Temporary id, resolved to a real id when the games are inserted. */
  key: string;
  stage: BracketStage;
  round: number;
  label: string;
  /** Set only for a seeded team or a bye; otherwise waits on `winnerTo`/`loserTo`. */
  home: string | null;
  away: string | null;
  winnerTo?: Exit;
  loserTo?: Exit;
  /** Final place for the winner / loser; set only when that team's run ends here. */
  winnerPlace?: number;
  loserPlace?: number;
}

type Ref = { seed: number } | { winner: string } | { loser: string };

interface Spec {
  key: string;
  round: number;
  stage: BracketStage;
  label: string;
  home: Ref;
  away: Ref;
  /** [winner's place, loser's place] when neither team moves on. */
  places?: [number, number];
  /** Loser's place when only the loser's run ends here. */
  loserPlace?: number;
}

const seed = (n: number): Ref => ({ seed: n });
const W = (key: string): Ref => ({ winner: key });
const L = (key: string): Ref => ({ loser: key });

const game = (
  key: string,
  round: number,
  stage: BracketStage,
  label: string,
  home: Ref,
  away: Ref,
  places?: [number, number],
  loserPlace?: number
): Spec => ({ key, round, stage, label, home, away, places, loserPlace });

/** Semi-finals, final and 3rd place, shared by every shape. Rounds are set by the caller. */
const top = (semiRound: number, finalRound: number, semi1: [Ref, Ref], semi2: [Ref, Ref]): Spec[] => [
  game('SF1', semiRound, 'knockout', 'Semi-final 1', ...semi1),
  game('SF2', semiRound, 'knockout', 'Semi-final 2', ...semi2),
  game('F', finalRound, 'knockout', 'Final', W('SF1'), W('SF2'), [1, 2]),
  game('3P', finalRound, 'placement', '3rd place', L('SF1'), L('SF2'), [3, 4]),
];

const TEMPLATES: Record<BracketShape, Record<number, Spec[]>> = {
  // Knockout only: nobody is knocked out of the schedule early.
  full: {
    8: [
      game('QF1', 1, 'knockout', 'Quarter-final 1', seed(1), seed(8)),
      game('QF2', 1, 'knockout', 'Quarter-final 2', seed(4), seed(5)),
      game('QF3', 1, 'knockout', 'Quarter-final 3', seed(2), seed(7)),
      game('QF4', 1, 'knockout', 'Quarter-final 4', seed(3), seed(6)),
      ...top(2, 3, [W('QF1'), W('QF2')], [W('QF3'), W('QF4')]),
      game('PS1', 2, 'placement', '5th-8th semi-final 1', L('QF1'), L('QF2')),
      game('PS2', 2, 'placement', '5th-8th semi-final 2', L('QF3'), L('QF4')),
      game('5P', 3, 'placement', '5th place', W('PS1'), W('PS2'), [5, 6]),
      game('7P', 3, 'placement', '7th place', L('PS1'), L('PS2'), [7, 8]),
    ],
    // Seed 1 has a bye.
    7: [
      game('QF1', 1, 'knockout', 'Quarter-final 1', seed(4), seed(5)),
      game('QF2', 1, 'knockout', 'Quarter-final 2', seed(2), seed(7)),
      game('QF3', 1, 'knockout', 'Quarter-final 3', seed(3), seed(6)),
      ...top(2, 3, [seed(1), W('QF1')], [W('QF2'), W('QF3')]),
      game('PS1', 2, 'placement', '6th-7th game', L('QF2'), L('QF3'), undefined, 7),
      game('5P', 3, 'placement', '5th place', L('QF1'), W('PS1'), [5, 6]),
    ],
    // Seeds 1 and 2 have byes.
    6: [
      game('QF1', 1, 'knockout', 'Quarter-final 1', seed(4), seed(5)),
      game('QF2', 1, 'knockout', 'Quarter-final 2', seed(3), seed(6)),
      ...top(2, 3, [seed(1), W('QF1')], [seed(2), W('QF2')]),
      game('5P', 2, 'placement', '5th place', L('QF1'), L('QF2'), [5, 6]),
    ],
  },
  // After a league: the top four play for the title, the rest for 5th and below.
  split: {
    8: [
      ...top(1, 2, [seed(1), seed(4)], [seed(2), seed(3)]),
      game('PS1', 1, 'placement', '5th-8th semi-final 1', seed(5), seed(8)),
      game('PS2', 1, 'placement', '5th-8th semi-final 2', seed(6), seed(7)),
      game('5P', 2, 'placement', '5th place', W('PS1'), W('PS2'), [5, 6]),
      game('7P', 2, 'placement', '7th place', L('PS1'), L('PS2'), [7, 8]),
    ],
    7: [
      ...top(1, 2, [seed(1), seed(4)], [seed(2), seed(3)]),
      game('PS1', 1, 'placement', '6th-7th game', seed(6), seed(7), undefined, 7),
      game('5P', 2, 'placement', '5th place', seed(5), W('PS1'), [5, 6]),
    ],
    6: [
      ...top(1, 2, [seed(1), seed(4)], [seed(2), seed(3)]),
      game('5P', 1, 'placement', '5th place', seed(5), seed(6), [5, 6]),
    ],
  },
};

/** Teams in a random order, for seeding a knockout-only bracket. */
export function randomSeeds(teamIds: readonly string[], rng?: Rng): string[] {
  return shuffle(teamIds, rng);
}

export function generateBracket(opts: { seeds: readonly string[]; shape: BracketShape }): PlanGame[] {
  const { seeds, shape } = opts;
  const n = seeds.length;
  if (n < MIN_TEAMS || n > MAX_TEAMS) {
    throw new Error(`A bracket needs ${MIN_TEAMS} to ${MAX_TEAMS} teams, got ${n}`);
  }
  if (new Set(seeds).size !== n) throw new Error('Seeds must be distinct');

  const specs = TEMPLATES[shape][n];
  const games: PlanGame[] = specs.map((s) => ({
    key: s.key,
    stage: s.stage,
    round: s.round,
    label: s.label,
    home: null,
    away: null,
    ...(s.places && { winnerPlace: s.places[0], loserPlace: s.places[1] }),
    ...(s.loserPlace !== undefined && { loserPlace: s.loserPlace }),
  }));
  const byKey = new Map(games.map((g) => [g.key, g]));

  for (const spec of specs) {
    const target = byKey.get(spec.key)!;
    (['home', 'away'] as const).forEach((slot) => {
      const ref = spec[slot];
      if ('seed' in ref) {
        target[slot] = seeds[ref.seed - 1];
      } else if ('winner' in ref) {
        byKey.get(ref.winner)!.winnerTo = { key: spec.key, slot };
      } else {
        byKey.get(ref.loser)!.loserTo = { key: spec.key, slot };
      }
    });
  }

  return games;
}

/**
 * Checks the invariants every bracket must hold. Returns a list of problems,
 * empty when the bracket is sound. Used by tests, and as a safety check before
 * games are inserted.
 */
export function validateBracket(games: readonly PlanGame[], teamCount: number): string[] {
  const problems: string[] = [];
  const byKey = new Map(games.map((g) => [g.key, g]));
  if (byKey.size !== games.length) problems.push('duplicate game keys');

  const targeted = new Set<string>();
  const places: number[] = [];

  for (const g of games) {
    for (const side of ['winner', 'loser'] as const) {
      const to = g[`${side}To`];
      const place = g[`${side}Place`];
      if (to && place !== undefined) problems.push(`${g.key}: ${side} has both an exit and a place`);
      if (!to && place === undefined) problems.push(`${g.key}: ${side} has neither an exit nor a place`);
      if (place !== undefined) places.push(place);
      if (to) {
        const target = byKey.get(to.key);
        if (!target) {
          problems.push(`${g.key}: ${side} goes to missing game ${to.key}`);
          continue;
        }
        if (target.round <= g.round) problems.push(`${g.key}: ${side} goes to an earlier or same round`);
        const slotKey = `${to.key}:${to.slot}`;
        if (targeted.has(slotKey)) problems.push(`${slotKey} is filled twice`);
        targeted.add(slotKey);
        if (target[to.slot] !== null) problems.push(`${slotKey} is both seeded and fed`);
      }
    }
  }

  for (const g of games) {
    for (const slot of ['home', 'away'] as const) {
      if (g[slot] === null && !targeted.has(`${g.key}:${slot}`)) {
        problems.push(`${g.key}:${slot} is never filled`);
      }
    }
  }

  const sorted = [...places].sort((a, b) => a - b);
  if (sorted.length !== teamCount || sorted.some((p, i) => p !== i + 1)) {
    problems.push(`places are ${sorted.join(',')}, expected 1..${teamCount}`);
  }
  return problems;
}
