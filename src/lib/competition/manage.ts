/**
 * What the Manage screen says about a block: where it is in its life, what the
 * next step is, and which actions are open with the reason for each that is not.
 *
 * Presentation only. Every rule here is also enforced by the database functions
 * and the Server Actions; this decides what to offer and what to say, so a person
 * is told "3 league games still need a result" instead of getting an error after
 * tapping.
 */

import { plural } from './labels';
import type { BlockRecord, GameRecord } from './types';

export const MIN_TEAMS = 6;
export const MAX_TEAMS = 8;

export type StepState = 'done' | 'now' | 'later';

export interface Step {
  key: 'setup' | 'league' | 'knockout' | 'completed';
  label: string;
  state: StepState;
}

/** The boxes of the stage tracker. A league-only block has no knockout step, and a knockout-only block no league step. */
export function stageTrack(block: Pick<BlockRecord, 'format' | 'status'>): Step[] {
  const keys: Step['key'][] = ['setup'];
  if (block.format !== 'knockout') keys.push('league');
  if (block.format !== 'league') keys.push('knockout');
  keys.push('completed');

  const labels = { setup: 'Setup', league: 'League', knockout: 'Knockout', completed: 'Completed' } as const;
  const current = block.status === 'setup' ? 'setup' : block.status;
  const at = keys.indexOf(current as Step['key']);

  return keys.map((key, i) => ({
    key,
    label: labels[key],
    // A finished block shows every box done, including its own.
    state: block.status === 'completed' || i < at ? 'done' : i === at ? 'now' : 'later',
  }));
}

export interface Counts {
  games: number;
  scheduled: number;
  played: number;
  /** Games with no result, split by whether they need a time. */
  unplayed: number;
  unscheduled: number;
  leagueUnplayed: number;
}

export function countGames(games: readonly GameRecord[]): Counts {
  const played = games.filter((g) => g.status === 'completed').length;
  return {
    games: games.length,
    scheduled: games.filter((g) => g.scheduled_date).length,
    played,
    unplayed: games.length - played,
    unscheduled: games.filter((g) => g.status !== 'completed' && !g.scheduled_date).length,
    leagueUnplayed: games.filter((g) => g.stage === 'league' && g.status !== 'completed').length,
  };
}

/** Games in a round-robin of `n` teams. */
export function roundRobinGames(n: number): number {
  return (n * (n - 1)) / 2;
}

/** Two groups of 3 or 4 (4 and 4, or 4 and 3 for seven teams). */
export function groupSizes(n: number): [number, number] {
  const a = Math.ceil(n / 2);
  return [a, n - a];
}

/** "8 teams in one table makes 28 games. Each team plays 7." */
export function fixturePreview(block: Pick<BlockRecord, 'format' | 'league_structure'>, teams: number): string {
  if (block.format === 'knockout') {
    return `${plural(teams, 'team')} makes a seeded bracket with placement games, so every team finishes in a place.`;
  }
  if (block.league_structure === 'groups') {
    const [a, b] = groupSizes(teams);
    const games = roundRobinGames(a) + roundRobinGames(b);
    return `${plural(teams, 'team')} in two groups (${a} and ${b}) makes ${games} games.`;
  }
  return `${plural(teams, 'team')} in one table makes ${roundRobinGames(teams)} games. Each team plays ${teams - 1}.`;
}

export interface ActionState {
  /** Whether this action is offered at all for the block. */
  shown: boolean;
  enabled: boolean;
  /** Why it is locked, or a note under an open one. */
  why: string | null;
}

export interface ManageActions {
  generate: ActionState & { label: string };
  schedule: ActionState;
  clear: ActionState;
  knockout: ActionState;
  complete: ActionState;
  reset: ActionState;
}

const shown = (enabled: boolean, why: string | null = null): ActionState => ({ shown: true, enabled, why });
const hidden: ActionState = { shown: false, enabled: false, why: null };

export function manageActions(
  block: Pick<BlockRecord, 'format' | 'status' | 'division'>,
  teams: number,
  games: readonly GameRecord[]
): ManageActions {
  const c = countGames(games);
  const done = block.status === 'completed';
  const setup = block.status === 'setup';

  // Fixtures: the league for a block that has one, the bracket for a knockout-only block.
  const genLabel = block.format === 'knockout' ? 'Generate bracket' : 'Generate fixtures';
  const generate = {
    label: genLabel,
    ...(!setup
      ? hidden
      : teams < MIN_TEAMS
        ? shown(false, `Needs at least ${MIN_TEAMS} teams. This division has ${teams}.`)
        : teams > MAX_TEAMS
          ? shown(false, `Handles up to ${MAX_TEAMS} teams. This division has ${teams}.`)
          : shown(true)),
  };

  const schedule = setup
    ? hidden
    : done
      ? shown(false, 'This block is completed. Reset it to change the schedule.')
      : c.unscheduled === 0
        ? shown(false, 'Every unplayed game already has a time.')
        : shown(true);

  const hasDays = games.some((g) => g.scheduled_date && g.status !== 'completed');
  const clear = setup ? hidden : done ? hidden : hasDays ? shown(true) : shown(false, 'No game days to clear yet.');

  const knockout =
    block.format === 'league_knockout' && block.status === 'league'
      ? c.leagueUnplayed > 0
        ? shown(false, `${plural(c.leagueUnplayed, 'league game')} still ${c.leagueUnplayed === 1 ? 'needs' : 'need'} a result.`)
        : shown(true, `All ${c.games} league games have a result. Teams are seeded from the table.`)
      : hidden;

  // A block can be completed from its last stage: the league of a league-only
  // block, or the knockout of the other two.
  const lastStage =
    (block.format === 'league' && block.status === 'league') ||
    (block.format !== 'league' && block.status === 'knockout');
  const complete = !lastStage
    ? hidden
    : c.unplayed > 0
      ? shown(
          false,
          c.unscheduled > 0
            ? `${plural(c.unplayed, 'game')} still ${c.unplayed === 1 ? 'needs' : 'need'} a result, and ${c.unscheduled} still ${c.unscheduled === 1 ? 'needs' : 'need'} a time.`
            : `${plural(c.unplayed, 'game')} still ${c.unplayed === 1 ? 'needs' : 'need'} a result.`
        )
      : shown(true, 'Every game has a result. Final places are published when you complete the block.');

  const reset = setup && games.length === 0 ? hidden : shown(true);

  return { generate, schedule, clear, knockout, complete, reset };
}

/** The one-line "Next step" under the tracker. */
export function nextStep(
  block: Pick<BlockRecord, 'format' | 'status' | 'division'>,
  teams: number,
  games: readonly GameRecord[],
  divisionName: string
): string {
  const c = countGames(games);
  switch (block.status) {
    case 'setup':
      if (teams < MIN_TEAMS) return `Add ${plural(MIN_TEAMS - teams, 'more team')} to ${divisionName}`;
      return block.format === 'knockout' ? 'Generate the bracket' : 'Generate fixtures';
    case 'completed':
      return 'Completed';
    default: {
      if (c.unplayed === 0) {
        return block.format === 'league_knockout' && block.status === 'league' ? 'Generate the knockout' : 'Complete the block';
      }
      if (c.unscheduled > 0 && c.played === 0) return 'Schedule a game day';
      return block.status === 'league' ? 'Score the remaining league games' : 'Score the remaining games';
    }
  }
}

export interface GameDay {
  date: string;
  games: number;
  played: number;
}

/** The days a block has games on, earliest first, for the clear-a-day picker. */
export function gameDays(games: readonly GameRecord[]): GameDay[] {
  const days = new Map<string, GameDay>();
  for (const g of games) {
    if (!g.scheduled_date) continue;
    const day = days.get(g.scheduled_date) ?? { date: g.scheduled_date, games: 0, played: 0 };
    day.games++;
    if (g.status === 'completed') day.played++;
    days.set(g.scheduled_date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** "3 slots × 2 courts = 6 games. 9 league games have no time yet." */
export function capacityText(slots: number, courts: number, unscheduled: number): string {
  const cells = slots * courts;
  return `${slots} slot${slots === 1 ? '' : 's'} × ${courts} court${courts === 1 ? '' : 's'} = ${plural(cells, 'game')}. ${plural(unscheduled, 'game')} ${unscheduled === 1 ? 'has' : 'have'} no time yet.`;
}

/** "Sport, division, format and league structure are locked because this block has 28 games." */
export function lockedNote(gameCount: number): string | null {
  return gameCount > 0
    ? `Sport, division, format and league structure are locked because this block has ${plural(gameCount, 'game')}. To change them, reset the block first.`
    : null;
}

const FORMAT_NAME = { league: 'League only', knockout: 'Knockout only', league_knockout: 'League then knockout' } as const;

/** "League then knockout · One table": what the block is, under its name. */
export function formatNote(block: Pick<BlockRecord, 'format' | 'league_structure'>): string {
  const parts: string[] = [FORMAT_NAME[block.format]];
  if (block.format !== 'knockout') parts.push(block.league_structure === 'groups' ? 'Two groups' : 'One table');
  return parts.join(' · ');
}
