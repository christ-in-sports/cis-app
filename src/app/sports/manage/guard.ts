/**
 * Who may open the Manage screens, and the block each one works on.
 *
 * Admin and Program Team only (project_spec.md 1.5). This is UX: a reader who
 * follows a link lands back on the standings. The database functions behind every
 * action check the role again, and RLS is the real boundary.
 */

import { notFound, redirect } from 'next/navigation';

import { countGames } from '@/lib/competition/manage';

import { getSportsData } from '../data';

export async function requireManager() {
  const loaded = await getSportsData();
  if (!loaded.canScore) redirect('/sports');
  return loaded.data;
}

export async function loadManagedBlock(blockId: string) {
  const data = await requireManager();
  const block = data.blocks.find((b) => b.id === blockId);
  if (!block) notFound();
  const games = data.games.filter((g) => g.sport_block_id === block.id);
  return {
    data,
    block,
    games,
    counts: countGames(games),
    teamCount: data.teams.filter((t) => t.division === block.division).length,
  };
}

/** Where "back" goes from any Manage form: the block, on the Manage screen. */
export function manageHref(block: { id: string; division: string }): string {
  return `/sports/manage?division=${block.division}&block=${block.id}`;
}
