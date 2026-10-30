import Link from 'next/link';

import { BoardHeader } from '@/components/cis/board-shell';
import { secondaryButtonClasses } from '@/components/cis/button';
import { Chip } from '@/components/cis/chip';
import { EmptyNotice } from '@/components/cis/empty-notice';
import { Icon } from '@/components/cis/icon';
import { SheetHeading } from '@/components/cis/sheet';
import { blockTitle, formatShortDate, ordinalParts } from '@/lib/competition/labels';
import { placeRows } from '@/lib/competition/view';
import { cn } from '@/lib/utils';

import { sportsHref } from '../data';
import { PlainSheet } from '../parts';
import { selectSports } from '../selection';

export const dynamic = 'force-dynamic';

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sel = await selectSports(await searchParams);
  const { data, division, block } = sel;

  const back = (
    <Link
      href={sportsHref('/sports', { division, block: block?.id })}
      className="flex min-h-cis-tap-min items-center gap-1 text-cis-sm font-bold text-cis-orange-deep"
    >
      <Icon name="chevron-left" size={16} strokeWidth={3} />
      Standings
    </Link>
  );

  if (!block) {
    return (
      <>
        {sel.keep}
        <BoardHeader kicker={back} title="Final places" />
        <PlainSheet>
          <EmptyNotice title="Nothing to show yet">Final places appear once a sport has been played and completed.</EmptyNotice>
        </PlainSheet>
      </>
    );
  }

  const games = sel.gamesOf(block.id);
  const title = blockTitle(division, block.sport);
  const completed = block.status === 'completed';

  if (!completed) {
    const played = games.filter((g) => g.status === 'completed').length;
    const knockout = block.format !== 'league';
    return (
      <>
        {sel.keep}
        <BoardHeader kicker={back} title="Final places" />
        <PlainSheet>
          <EmptyNotice
            title={title}
            note={`${played} of ${games.length} games played`}
            action={
              <Link
                href={sportsHref(knockout ? '/sports/bracket' : '/sports', { division, block: block.id })}
                className={`${secondaryButtonClasses} w-full`}
              >
                {knockout ? 'See the bracket' : 'See standings'}
              </Link>
            }
          >
            Final places show up once the program team completes the block.
            {knockout ? ' The knockout is still being played.' : ''}
          </EmptyNotice>
        </PlainSheet>
      </>
    );
  }

  const rows = placeRows(
    block,
    sel.teams,
    data.places.filter((p) => p.sport_block_id === block.id),
    games,
    sel.results
  );
  const lastDay = games
    .filter((g) => g.status === 'completed' && g.scheduled_date)
    .map((g) => g.scheduled_date!)
    .sort()
    .pop();

  return (
    <>
      {sel.keep}
      <BoardHeader kicker={back} title="Final places" action={<Chip variant="sport">Final</Chip>} />
      <PlainSheet>
        <div className="flex items-baseline justify-between gap-2.5 pb-3">
          <SheetHeading>{title}</SheetHeading>
          {lastDay ? <div className="text-cis-xs font-bold text-cis-ink-muted">Completed {formatShortDate(lastDay)}</div> : null}
        </div>
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">{title} final places</caption>
          <colgroup>
            <col style={{ width: '60px' }} />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b-4 border-cis-ink-dark text-left">
              <th scope="col" className="pb-2 text-center text-cis-xs font-bold text-cis-ink-muted">
                Place
              </th>
              <th scope="col" className="pb-2 text-cis-xs font-bold text-cis-ink-muted">
                Team
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { value, suffix } = ordinalParts(row.place);
              return (
                <tr key={row.place} className={cn('border-b border-cis-rule', row.place === 1 && 'bg-cis-ember-tint')}>
                  <th
                    scope="row"
                    className={cn(
                      'py-3 text-center align-middle font-cis-display text-[34px] font-normal leading-none',
                      row.place === 1 ? 'text-cis-ember' : 'text-cis-ink',
                    )}
                  >
                    {value}
                    <sup className="ml-px align-top font-cis-body text-cis-xs font-extrabold text-cis-ink-muted">{suffix}</sup>
                  </th>
                  <td className="py-3 align-middle">
                    <div className="font-cis-display text-cis-xl leading-[1.1]">{row.team}</div>
                    {row.how ? <div className="mt-[3px] text-cis-xs font-bold text-cis-ink-muted">{row.how}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
          {block.format === 'league'
            ? 'Teams are placed by the final league table.'
            : 'Every team finishes with its own place, from the final down through the placement games.'}
        </p>
      </PlainSheet>
    </>
  );
}
