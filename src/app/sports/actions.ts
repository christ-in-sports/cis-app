'use server';

/**
 * Sports competition writes (ENG-14): setting up a sport block, generating its
 * fixtures and bracket, recording results, scheduling game days, and closing the
 * block out.
 *
 * Thin by design, like the registration actions: each one authenticates early
 * enough to give a readable message, validates its input with the Zod schemas in
 * `src/lib/validation/competition.ts`, and hands over to the operation in
 * `src/lib/competition/service.ts`. The Admin / Program Team check here is UX
 * and defence in depth only -- RLS and the `has_role()` checks inside the
 * database functions are the real boundary, so a bug here produces a worse
 * message, never access.
 *
 * Results use the shared `{ ok, error? }` shape.
 */

import { revalidatePath } from 'next/cache';
import type { ZodType } from 'zod';

import { checkAnyRole } from '@/lib/auth/roles';
import {
  clearGameDay as clearGameDayOp,
  clearResult as clearResultOp,
  completeSportBlock as completeSportBlockOp,
  generateKnockout as generateKnockoutOp,
  generateLeagueFixtures as generateLeagueFixturesOp,
  recordResult as recordResultOp,
  resetSportBlock as resetSportBlockOp,
  saveSportBlock as saveSportBlockOp,
  scheduleGameDay as scheduleGameDayOp,
  type Outcome,
} from '@/lib/competition/service';
import {
  blockIdSchema,
  clearGameDaySchema,
  firstIssue,
  gameIdSchema,
  recordResultSchema,
  saveSportBlockSchema,
  scheduleGameDaySchema,
} from '@/lib/validation/competition';

type Db = Awaited<ReturnType<typeof checkAnyRole>>['supabase'];

/**
 * Signs the caller in, checks they may update sports standings (Admin or Program
 * Team, project_spec.md 1.5), validates `input`, and runs `op`.
 */
async function run<S extends ZodType, T extends object>(
  schema: S,
  input: unknown,
  op: (db: Db, data: S['_output']) => Promise<Outcome<T>>,
): Promise<Outcome<T>> {
  const { supabase, userId, hasRole } = await checkAnyRole(['admin', 'program']);

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!hasRole) {
    return { ok: false, error: 'Only Admin or Program Team can update sports standings.' };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const result = await op(supabase, parsed.data);
  if (result.ok) revalidatePath('/sports', 'layout');
  return result;
}

/** Creates a sport block, or edits one when `id` is given. Never touches its games. */
export async function saveSportBlock(input: unknown) {
  return run(saveSportBlockSchema, input, (db, data) => saveSportBlockOp(db, data));
}

/** Deletes a block's games and results and returns it to setup. */
export async function resetSportBlock(input: unknown) {
  return run(blockIdSchema, input, (db, { blockId }) => resetSportBlockOp(db, blockId));
}

/** Creates the league stage: a round-robin, or two groups. */
export async function generateLeagueFixtures(input: unknown) {
  return run(blockIdSchema, input, (db, { blockId }) => generateLeagueFixturesOp(db, blockId));
}

/** Creates the knockout stage, seeded from the finished league or at random. */
export async function generateKnockout(input: unknown) {
  return run(blockIdSchema, input, (db, { blockId }) => generateKnockoutOp(db, blockId));
}

/** Records or corrects a game's result; the winner and loser advance in the same transaction. */
export async function recordResult(input: unknown) {
  return run(recordResultSchema, input, (db, data) => recordResultOp(db, data));
}

export async function clearResult(input: unknown) {
  return run(gameIdSchema, input, (db, { gameId }) => clearResultOp(db, gameId));
}

/** Fills a game day's slots and courts with the block's unscheduled games. */
export async function scheduleGameDay(input: unknown) {
  return run(scheduleGameDaySchema, input, (db, data) => scheduleGameDayOp(db, data));
}

/** Takes the block's unplayed games off a game day. Results are kept. */
export async function clearGameDay(input: unknown) {
  return run(clearGameDaySchema, input, (db, { blockId, date }) => clearGameDayOp(db, blockId, date));
}

/** Closes a block and records every team's final place. */
export async function completeSportBlock(input: unknown) {
  return run(blockIdSchema, input, (db, { blockId }) => completeSportBlockOp(db, blockId));
}
