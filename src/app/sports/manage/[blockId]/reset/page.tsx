import { BoardHeader } from '@/components/cis/board-shell';
import { blockTitle, DIVISION_NAME, plural } from '@/lib/competition/labels';
import { gameDays } from '@/lib/competition/manage';

import { ResetForm } from '../../day-forms';
import { loadManagedBlock, manageHref } from '../../guard';

export const dynamic = 'force-dynamic';

export default async function ResetBlockPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { data, block, games, counts, teamCount } = await loadManagedBlock((await params).blockId);
  const places = data.places.filter((p) => p.sport_block_id === block.id).length;
  const days = gameDays(games).length;
  const title = blockTitle(block.division, block.sport);

  const deletes = [
    { label: 'Games', value: String(counts.games) },
    { label: 'Results', value: String(counts.played) },
    ...(places > 0 ? [{ label: 'Final places', value: plural(places, 'team') }] : []),
    { label: 'Game day times and courts', value: plural(days, 'day') },
  ];

  return (
    <>
      <BoardHeader kicker={`${title} · ${block.status === 'completed' ? 'Completed' : 'In progress'}`} title="Reset block" />
      <ResetForm
        blockId={block.id}
        backHref={manageHref(block)}
        title={title}
        deletes={deletes}
        keeps={`The ${teamCount} ${DIVISION_NAME[block.division]} teams and the block's settings. The block goes back to Setup.`}
      />
    </>
  );
}
