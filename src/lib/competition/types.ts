/**
 * The rows the Sports screens read, as the database returns them.
 *
 * Only the columns the screens use. `service.ts` keeps its own narrower row types
 * for the same tables; these are the read-side ones, shared by the loaders, the
 * view logic in `view.ts`, and the components, so a screen never reaches for the
 * database's snake_case anywhere but the edge.
 */

import type { LeagueStructure } from './fixtures';
import type { SportSettings, Stage } from './scores';

export type Division = 'juniors' | 'ambassadors';
export type BlockFormat = 'league' | 'knockout' | 'league_knockout';
export type BlockStatus = 'setup' | 'league' | 'knockout' | 'completed';
export type GameStatus = 'scheduled' | 'completed';
export type Slot = 'home' | 'away';

export interface TeamRecord {
  active: boolean;
  id: string;
  name: string;
  division: Division;
}

export interface BlockRecord {
  id: string;
  season_id: string;
  division: Division;
  sport: string;
  format: BlockFormat;
  league_structure: LeagueStructure | null;
  status: BlockStatus;
  starts_on: string | null;
  ends_on: string | null;
  settings: SportSettings | null;
}

export interface GameRecord {
  id: string;
  sport_block_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  stage: Stage;
  group_label: 'A' | 'B' | null;
  round: number;
  label: string;
  /** `YYYY-MM-DD`, no time zone. */
  scheduled_date: string | null;
  /** `HH:MM:SS`. */
  scheduled_time: string | null;
  court: number | null;
  status: GameStatus;
  winner_to_game_id: string | null;
  winner_to_slot: Slot | null;
  loser_to_game_id: string | null;
  loser_to_slot: Slot | null;
  winner_place: number | null;
  loser_place: number | null;
}

export interface ResultRecord {
  game_id: string;
  home_total: number;
  away_total: number;
  winner_team_id: string | null;
  tiebreak_winner_team_id: string | null;
  recorded_by: string | null;
  recorded_at: string;
  details: unknown;
}

export interface PlaceRecord {
  sport_block_id: string;
  team_id: string;
  place: number;
}
