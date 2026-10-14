import { BoardHeader } from '@/components/cis/board-shell';
import { blockTitle } from '@/lib/competition/labels';
import { gameDays } from '@/lib/competition/manage';

import { ClearDayForm } from '../../day-forms';
import { loadManagedBlock, manageHref } from '../../guard';

export const dynamic = 'force-dynamic';

export default async function ClearDayPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { block, games } = await loadManagedBlock((await params).blockId);
  return (
    <>
      <BoardHeader kicker={blockTitle(block.division, block.sport)} title="Clear a game day" />
      <ClearDayForm blockId={block.id} backHref={manageHref(block)} days={gameDays(games)} />
    </>
  );
}
