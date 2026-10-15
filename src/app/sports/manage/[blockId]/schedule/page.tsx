import { BoardHeader } from '@/components/cis/board-shell';
import { blockTitle } from '@/lib/competition/labels';

import { ScheduleDayForm } from '../../day-forms';
import { loadManagedBlock, manageHref } from '../../guard';

export const dynamic = 'force-dynamic';

export default async function ScheduleDayPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { block, counts } = await loadManagedBlock((await params).blockId);
  const first = block.starts_on ?? '';
  return (
    <>
      <BoardHeader kicker={blockTitle(block.division, block.sport)} title="Schedule a game day" />
      <ScheduleDayForm blockId={block.id} backHref={manageHref(block)} unscheduled={counts.unscheduled} defaultDate={first} />
    </>
  );
}
