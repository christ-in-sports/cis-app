/**
 * Which division and block a Sports page is showing, worked out from the URL.
 *
 * Pages stay bookmarkable and shareable because the choice lives in
 * `?division=` and `?block=`, not in component state. Anything unknown in the URL
 * falls back to something sensible rather than an error (see `pickDivision`).
 */

import type { SportsData } from '@/lib/competition/read';
import { blocksInDivision, pickBlock, pickDivision } from '@/lib/competition/read';
import type { BlockRecord, GameRecord, ResultRecord, TeamRecord } from '@/lib/competition/types';

import { getSportsData, param } from './data';

type SearchParams = Record<string, string | string[] | undefined>;

export interface Selection {
  data: SportsData;
  canScore: boolean;
  division: 'juniors' | 'ambassadors';
  /** Every block of the division, in listing order. */
  inDivision: BlockRecord[];
  /** The ones this page can show, after `only`. */
  choices: BlockRecord[];
  block: BlockRecord | null;
  teams: Map<string, TeamRecord>;
  results: Map<string, ResultRecord>;
  gamesOf: (blockId: string) => GameRecord[];
}

export async function selectSports(
  searchParams: SearchParams,
  opts: { only?: (block: BlockRecord) => boolean } = {}
): Promise<Selection> {
  const { data, canScore } = await getSportsData();
  const division = pickDivision({
    requested: param(searchParams, 'division'),
    blocks: data.blocks,
    teams: data.teams,
    myTeamIds: data.myTeamIds,
  });
  const inDivision = blocksInDivision(data.blocks, division);
  const choices = opts.only ? inDivision.filter(opts.only) : inDivision;
  const block = pickBlock(choices, param(searchParams, 'block'));

  return {
    data,
    canScore,
    division,
    inDivision,
    choices,
    block,
    teams: new Map(data.teams.map((t) => [t.id, t])),
    results: new Map(data.results.map((r) => [r.game_id, r])),
    gamesOf: (blockId) => data.games.filter((g) => g.sport_block_id === blockId),
  };
}
