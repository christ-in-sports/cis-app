import { BoardHeader } from '@/components/cis/board-shell';

import { param } from '../../data';
import { BlockForm } from '../block-form';
import { requireManager } from '../guard';

export const dynamic = 'force-dynamic';

export default async function NewBlockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await requireManager();
  const sp = await searchParams;
  const division = param(sp, 'division') === 'ambassadors' ? 'ambassadors' : 'juniors';

  return (
    <>
      <BoardHeader kicker="Admin · Manage sports" title="New block" />
      <BlockForm
        gameCount={0}
        backHref={`/sports/manage?division=${division}`}
        initial={{
          division,
          sport: 'soccer',
          format: 'league_knockout',
          leagueStructure: 'round_robin',
          startsOn: data.season?.starts_on ?? '',
          endsOn: data.season?.ends_on ?? '',
          settings: {},
        }}
      />
    </>
  );
}
