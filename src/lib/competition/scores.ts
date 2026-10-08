/**
 * Per-sport score detail, and turning it into a result.
 *
 * Each sport records a different amount of detail, kept in `game_results.details`
 * (jsonb): goals or points for soccer and basketball, every set's score for
 * volleyball, who won each round for dodgeball. These Zod schemas are the single
 * source of truth for that shape (AGENTS.md section 4) -- the Server Action
 * validates with them before the database sees the result.
 *
 * The sports are a registry, not a database CHECK, because sports change from
 * season to season: adding one means adding an entry to `SPORTS`.
 */

import { z } from 'zod';

export type Side = 'home' | 'away';
export type Stage = 'league' | 'knockout' | 'placement';

export interface Totals {
  home: number;
  away: number;
}

/** Sport-level settings kept in `sport_blocks.settings`. */
export interface SportSettings {
  /** Volleyball: most sets a game can have. */
  maxSets?: number;
  /** Dodgeball: most rounds a game can have. */
  maxRounds?: number;
  /** Minutes one game takes, used to lay out the schedule. */
  gameMinutes?: number;
}

const score = z.number().int().min(0).max(999);

const pointsDetails = z.object({ home: score, away: score });

const volleyballDetails = z.object({
  sets: z.array(z.object({ home: score, away: score })).min(1),
});

const dodgeballDetails = z.object({
  rounds: z.array(z.object({ winner: z.enum(['home', 'away']).nullable() })).min(1),
});

export interface SportDefinition {
  label: string;
  /** Validates the `details` blob. */
  schema: z.ZodType<unknown>;
  /** Home and away totals: goals or points, sets won, or rounds won. */
  totals: (details: never, settings: SportSettings) => Totals;
  /** The details of a game that has not started. */
  empty: (settings: SportSettings) => unknown;
  /** Standings column labels: difference, and "scored" (GD/GF, ...). */
  columns: { difference: string; scored: string };
  defaults: Required<Pick<SportSettings, 'gameMinutes'>> & SportSettings;
}

const pointsSport = (
  label: string,
  columns: SportDefinition['columns'],
  gameMinutes: number
): SportDefinition => ({
  label,
  schema: pointsDetails,
  totals: (d: z.infer<typeof pointsDetails>) => ({ home: d.home, away: d.away }),
  empty: () => ({ home: 0, away: 0 }),
  columns,
  defaults: { gameMinutes },
});

export const SPORTS = {
  soccer: pointsSport('Soccer', { difference: 'GD', scored: 'GF' }, 20),
  basketball: pointsSport('Basketball', { difference: 'PD', scored: 'PF' }, 20),
  volleyball: {
    label: 'Volleyball',
    schema: volleyballDetails,
    // A set that is still 0-0 has not been played.
    totals: (d: z.infer<typeof volleyballDetails>) => ({
      home: d.sets.filter((s) => s.home > s.away).length,
      away: d.sets.filter((s) => s.away > s.home).length,
    }),
    empty: (settings: SportSettings) => ({
      sets: Array.from({ length: settings.maxSets ?? 5 }, () => ({ home: 0, away: 0 })),
    }),
    columns: { difference: 'SD', scored: 'SW' },
    defaults: { gameMinutes: 20, maxSets: 5 },
  },
  dodgeball: {
    label: 'Dodgeball',
    schema: dodgeballDetails,
    totals: (d: z.infer<typeof dodgeballDetails>) => ({
      home: d.rounds.filter((r) => r.winner === 'home').length,
      away: d.rounds.filter((r) => r.winner === 'away').length,
    }),
    empty: (settings: SportSettings) => ({
      rounds: Array.from({ length: settings.maxRounds ?? 5 }, () => ({ winner: null })),
    }),
    columns: { difference: 'RD', scored: 'RW' },
    defaults: { gameMinutes: 15, maxRounds: 5 },
  },
} as const satisfies Record<string, SportDefinition>;

export type KnownSport = keyof typeof SPORTS;

export function isKnownSport(sport: string): sport is KnownSport {
  return Object.hasOwn(SPORTS, sport);
}

function definition(sport: string): SportDefinition {
  if (!isKnownSport(sport)) throw new Error(`Unknown sport "${sport}"`);
  return SPORTS[sport];
}

/** Settings with the sport's defaults filled in. */
export function sportSettings(sport: string, settings: SportSettings = {}): SportSettings {
  return { ...definition(sport).defaults, ...settings };
}

export function sportColumns(sport: string) {
  return definition(sport).columns;
}

export function emptyDetails(sport: string, settings: SportSettings = {}): unknown {
  return definition(sport).empty(sportSettings(sport, settings));
}

export type DetailsResult =
  | { ok: true; details: unknown; totals: Totals }
  | { ok: false; error: string };

/**
 * Validates a game's `details` for its sport and works out the totals.
 * Volleyball and dodgeball are also held to the block's set / round limit.
 */
export function parseDetails(
  sport: string,
  details: unknown,
  settings: SportSettings = {}
): DetailsResult {
  const def = definition(sport);
  const parsed = def.schema.safeParse(details);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid score' };
  }
  const merged = sportSettings(sport, settings);
  const data = parsed.data as { sets?: unknown[]; rounds?: unknown[] };
  if (data.sets && merged.maxSets && data.sets.length > merged.maxSets) {
    return { ok: false, error: `At most ${merged.maxSets} sets` };
  }
  if (data.rounds && merged.maxRounds && data.rounds.length > merged.maxRounds) {
    return { ok: false, error: `At most ${merged.maxRounds} rounds` };
  }
  return { ok: true, details: parsed.data, totals: def.totals(parsed.data as never, merged) };
}

export type WinnerResult =
  | { ok: true; winner: Side | null }
  | { ok: false; error: string };

/**
 * Works out who won a game from its totals.
 *
 * League games can be drawn (`winner: null`). A knockout or placement game
 * must have a winner, so a level score needs `tiebreakWinner` (a shootout,
 * overtime, or an extra round) and an unlevel score must not have one -- the
 * prototype let a drawn knockout game stall the whole bracket.
 */
export function resolveWinner(
  stage: Stage,
  totals: Totals,
  tiebreakWinner?: Side | null
): WinnerResult {
  const level = totals.home === totals.away;

  if (stage === 'league') {
    if (tiebreakWinner) return { ok: false, error: 'League games have no tiebreak' };
    if (level) return { ok: true, winner: null };
    return { ok: true, winner: totals.home > totals.away ? 'home' : 'away' };
  }

  if (level) {
    if (!tiebreakWinner) {
      return { ok: false, error: 'A knockout game needs a winner: record who won the tiebreak' };
    }
    return { ok: true, winner: tiebreakWinner };
  }
  if (tiebreakWinner) {
    return { ok: false, error: 'Only a level game has a tiebreak winner' };
  }
  return { ok: true, winner: totals.home > totals.away ? 'home' : 'away' };
}
