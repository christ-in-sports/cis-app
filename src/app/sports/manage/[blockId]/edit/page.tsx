import { BoardHeader } from '@/components/cis/board-shell';

import { BlockForm } from '../../block-form';
import { loadManagedBlock, manageHref } from '../../guard';

export const dynamic = 'force-dynamic';

export default async function EditBlockPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { block, counts } = await loadManagedBlock((await params).blockId);
  const settings = (block.settings ?? {}) as { gameMinutes?: number; maxSets?: number; maxRounds?: number };

  return (
    <>
      <BoardHeader kicker="Admin · Manage sports" title="Edit block" />
      <BlockForm
        gameCount={counts.games}
        backHref={manageHref(block)}
        initial={{
          id: block.id,
          division: block.division,
          sport: block.sport,
          format: block.format,
          leagueStructure: block.league_structure ?? 'round_robin',
          startsOn: block.starts_on ?? '',
          endsOn: block.ends_on ?? '',
          settings,
        }}
      />
    </>
  );
}
