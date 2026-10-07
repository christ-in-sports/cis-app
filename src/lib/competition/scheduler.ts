/**
 * Places games into a game day's time slots and courts.
 *
 * Ported from the prototype's `autoSchedule` (schedule-client.tsx at b4a77a6),
 * which was the best part of that module, as a pure function. It fills free
 * cells earliest slot first and:
 *
 *  - never puts a team in two games in the same slot;
 *  - spreads each team's games out, and avoids three slots in a row;
 *  - places games with both teams known before games still waiting on a result
 *    (knockout games), which take the leftover cells so the day stays full;
 *  - never places a waiting game in or before a slot of a game that feeds it.
 *    The prototype did not check that last rule.
 *
 * Calling it again with the games already placed only fills what is still free,
 * which is how a knockout bracket drops into open slots once it exists.
 */

import type { Stage } from './scores';

export interface SchedulableGame {
  id: string;
  home: string | null;
  away: string | null;
  stage: Stage;
  round: number;
  /** Ids of games whose winner or loser plays in this one. */
  feeders?: readonly string[];
  /** Orders waiting games within a round, e.g. the main bracket before the placement games. */
  order?: number;
}

export interface PlacedGame {
  id: string;
  home: string | null;
  away: string | null;
  slot: number;
  court: number;
}

export interface Assignment {
  gameId: string;
  slot: number;
  court: number;
}

export interface ScheduleResult {
  assignments: Assignment[];
  /** Games that found no cell, in the order given. */
  unplaced: string[];
  /** Cells still empty after placing. */
  openCells: number;
}

/** Penalty that makes a third game in a row the last resort. */
const THREE_IN_A_ROW = 100;
/** A team with no earlier game counts as well rested. */
const WELL_RESTED = 99;

const STAGE_ORDER: Record<Stage, number> = { league: 0, knockout: 1, placement: 2 };

export function scheduleDay(opts: {
  slots: number;
  courts: number;
  games: readonly SchedulableGame[];
  placed?: readonly PlacedGame[];
}): ScheduleResult {
  const { slots, courts, games, placed = [] } = opts;
  const taken = new Set(placed.map((p) => `${p.slot}:${p.court}`));
  const slotOf = new Map(placed.map((p) => [p.id, p.slot]));

  // Teams already playing in each slot, and each team's slot history.
  const busy = new Map<number, Set<string>>();
  const history = new Map<string, number[]>();
  const play = (slot: number, teams: (string | null)[]) => {
    for (const team of teams) {
      if (!team) continue;
      if (!busy.has(slot)) busy.set(slot, new Set());
      busy.get(slot)!.add(team);
      history.set(team, [...(history.get(team) ?? []), slot]);
    }
  };
  for (const p of placed) play(p.slot, [p.home, p.away]);

  const pool = new Map(games.map((g) => [g.id, g]));
  const ready = games
    .filter((g) => g.home && g.away)
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.round - b.round);
  const waiting = games
    .filter((g) => !g.home || !g.away)
    .sort((a, b) => a.round - b.round || (a.order ?? 0) - (b.order ?? 0));

  /** A game can go in `slot` only if every feeder still to be played is placed earlier. */
  const feedersAllow = (g: SchedulableGame, slot: number) =>
    (g.feeders ?? []).every((id) => {
      const at = slotOf.get(id);
      if (at !== undefined) return at < slot;
      return !pool.has(id); // a feeder not in play today (already played, or another day) doesn't constrain
    });

  const score = (g: SchedulableGame, slot: number): number | null => {
    const slotBusy = busy.get(slot);
    if (slotBusy?.has(g.home!) || slotBusy?.has(g.away!)) return null;
    let total = 0;
    for (const team of [g.home!, g.away!]) {
      const slotsPlayed = history.get(team) ?? [];
      const earlier = slotsPlayed.filter((s) => s < slot);
      total += earlier.length ? slot - Math.max(...earlier) : WELL_RESTED;
      if (slotsPlayed.includes(slot - 1) && slotsPlayed.includes(slot - 2)) total -= THREE_IN_A_ROW;
    }
    return total;
  };

  const assignments: Assignment[] = [];
  const remainingReady = [...ready];
  const remainingWaiting = [...waiting];
  let open = 0;

  for (let slot = 1; slot <= slots; slot++) {
    for (let court = 1; court <= courts; court++) {
      if (taken.has(`${slot}:${court}`)) continue;

      let pick: SchedulableGame | undefined;
      let best = -Infinity;
      for (const g of remainingReady) {
        if (!feedersAllow(g, slot)) continue;
        const s = score(g, slot);
        if (s !== null && s > best) {
          best = s;
          pick = g;
        }
      }
      if (pick) {
        remainingReady.splice(remainingReady.indexOf(pick), 1);
        play(slot, [pick.home, pick.away]);
      } else {
        // Nothing with known teams fits; a waiting game takes the cell if its
        // feeders are all earlier and any team it already knows is free.
        pick = remainingWaiting.find((g) => {
          const known = [g.home, g.away].filter((t): t is string => !!t);
          return feedersAllow(g, slot) && known.every((t) => !busy.get(slot)?.has(t));
        });
        if (pick) {
          remainingWaiting.splice(remainingWaiting.indexOf(pick), 1);
          play(slot, [pick.home, pick.away]);
        }
      }

      if (pick) {
        assignments.push({ gameId: pick.id, slot, court });
        slotOf.set(pick.id, slot);
      } else {
        open++;
      }
    }
  }

  return {
    assignments,
    unplaced: games
      .filter((g) => !assignments.some((a) => a.gameId === g.id))
      .map((g) => g.id),
    openCells: open,
  };
}

/** Clock time ("HH:MM") of a 1-based slot, given the day's start and game length. */
export function slotTime(startTime: string, slot: number, gameMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + (slot - 1) * gameMinutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
