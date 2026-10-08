/**
 * What the sports Server Actions accept (ENG-14).
 *
 * These are the single source of truth for the shape of each action's input
 * (AGENTS.md section 4); the actions parse with them before anything reaches the
 * database, and the types come from `z.infer`. The per-sport `details` of a
 * result are validated separately, in `parseDetails` (src/lib/competition/scores.ts),
 * because what a result may contain depends on the block's sport.
 *
 * The block rules mirror the migration's CHECK constraints
 * (`sport_blocks_league_structure_matches_format`, `sport_blocks_dates_ordered`),
 * so a mistake shows a readable message here instead of a constraint name. The
 * database stays the boundary.
 */

import { z } from 'zod';

import { LEAGUE_STRUCTURES } from '@/lib/competition/fixtures';
import { isKnownSport } from '@/lib/competition/scores';
import { DIVISIONS } from '@/lib/validation/kid';

/** Matches the `sport_blocks_format_values` CHECK. */
export const BLOCK_FORMATS = ['league', 'knockout', 'league_knockout'] as const;
export type BlockFormat = (typeof BLOCK_FORMATS)[number];

/** Most courts and slots one game day can have; a typo guard, not a policy. */
export const MAX_COURTS = 8;
export const MAX_SLOTS = 24;

const id = z.string().uuid('That is not a valid id');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-17')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'That is not a real date');

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 14:00');

export const sportSettingsSchema = z
  .object({
    maxSets: z.number().int().min(1).max(9).optional(),
    maxRounds: z.number().int().min(1).max(15).optional(),
    gameMinutes: z.number().int().min(5).max(180).optional(),
  })
  .strict();

export const saveSportBlockSchema = z
  .object({
    /** Present when editing; omitted when creating. */
    id: id.optional(),
    /** Defaults to the current season when creating. Never changes on an edit. */
    seasonId: id.optional(),
    division: z.enum(DIVISIONS),
    sport: z
      .string()
      .trim()
      .min(1, 'Choose a sport')
      .refine(isKnownSport, 'That sport is not set up yet'),
    format: z.enum(BLOCK_FORMATS),
    leagueStructure: z.enum(LEAGUE_STRUCTURES).nullish(),
    startsOn: isoDate.nullish(),
    endsOn: isoDate.nullish(),
    settings: sportSettingsSchema.default({}),
  })
  .superRefine((v, ctx) => {
    if (v.format === 'knockout' && v.leagueStructure) {
      ctx.addIssue({ code: 'custom', path: ['leagueStructure'], message: 'A knockout-only block has no league structure' });
    }
    if (v.format === 'league' && v.leagueStructure === 'groups') {
      ctx.addIssue({ code: 'custom', path: ['leagueStructure'], message: 'A league-only block is a round-robin' });
    }
    if (v.format === 'league_knockout' && !v.leagueStructure) {
      ctx.addIssue({ code: 'custom', path: ['leagueStructure'], message: 'Choose a league structure' });
    }
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) {
      ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'The end date is before the start date' });
    }
  })
  .transform((v) => ({
    ...v,
    startsOn: v.startsOn ?? null,
    endsOn: v.endsOn ?? null,
    // A league-only block is always a round-robin and a knockout has none, so
    // the caller need not say.
    leagueStructure:
      v.format === 'knockout' ? null : v.format === 'league' ? ('round_robin' as const) : (v.leagueStructure ?? null),
  }));

export type SaveSportBlockInput = z.infer<typeof saveSportBlockSchema>;

export const blockIdSchema = z.object({ blockId: id });

export const gameIdSchema = z.object({ gameId: id });

export const recordResultSchema = z.object({
  gameId: id,
  /** Checked against the block's sport by `parseDetails`. */
  details: z.unknown(),
  /** Who won a level knockout game (a shootout, overtime, an extra round). */
  tiebreakWinner: z.enum(['home', 'away']).nullish(),
});

export type RecordResultInput = z.infer<typeof recordResultSchema>;

export const scheduleGameDaySchema = z.object({
  blockId: id,
  date: isoDate,
  startTime: clockTime,
  slots: z.number().int().min(1, 'A game day needs at least one slot').max(MAX_SLOTS),
  courts: z.number().int().min(1, 'A game day needs at least one court').max(MAX_COURTS),
});

export type ScheduleGameDayInput = z.infer<typeof scheduleGameDaySchema>;

export const clearGameDaySchema = z.object({ blockId: id, date: isoDate });

/** The first problem in a failed parse, in words a person can act on. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'That input is not valid';
  return issue.message;
}
