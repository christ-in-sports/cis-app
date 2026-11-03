/**
 * The one game Today leads with.
 *
 * The earliest scheduled game from today on whose teams are both known. When the
 * viewer has teams (a coach's, or their kids'), it is the next game one of those
 * teams plays; otherwise the next game in the season. Played games, and games
 * still waiting on an earlier result, are skipped.
 */

import type { SportsData } from './read';
import type { BlockRecord, GameRecord } from './types';

export interface NextGame {
  game: GameRecord;
  block: BlockRecord;
  home: string;
  away: string;
  /** Whether one of the viewer's own teams plays in it. */
  mine: boolean;
}

/** `today` is `YYYY-MM-DD` in the program's time zone. */
export function nextGame(data: Pick<SportsData, 'blocks' | 'teams' | 'games' | 'myTeamIds'>, today: string): NextGame | null {
  const blocks = new Map(data.blocks.map((b) => [b.id, b]));
  const names = new Map(data.teams.map((t) => [t.id, t.name]));
  const mine = new Set(data.myTeamIds);

  const upcoming = data.games.filter(
    (g) =>
      g.status === 'scheduled' &&
      g.scheduled_date !== null &&
      g.scheduled_date >= today &&
      g.home_team_id !== null &&
      g.away_team_id !== null &&
      blocks.has(g.sport_block_id),
  );
  const theirs = upcoming.filter((g) => mine.has(g.home_team_id!) || mine.has(g.away_team_id!));
  const pool = theirs.length ? theirs : upcoming;
  if (!pool.length) return null;

  const [game] = [...pool].sort(
    (a, b) =>
      a.scheduled_date!.localeCompare(b.scheduled_date!) ||
      // A game with no time yet sorts after the timed games on its day.
      (a.scheduled_time ?? '99').localeCompare(b.scheduled_time ?? '99') ||
      (a.court ?? Infinity) - (b.court ?? Infinity),
  );
  return {
    game,
    block: blocks.get(game.sport_block_id)!,
    home: names.get(game.home_team_id!) ?? 'Team',
    away: names.get(game.away_team_id!) ?? 'Team',
    mine: theirs.length > 0,
  };
}
