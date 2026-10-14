import Link from 'next/link';

import { BlockSwitcher } from '@/components/cis/block-switcher';
import { BoardHeader } from '@/components/cis/board-shell';
import { Chip } from '@/components/cis/chip';
import { primaryButtonClasses, secondaryButtonClasses } from '@/components/cis/button';
import { DivisionTabs } from '@/components/cis/division-tabs';
import { EmptyNotice } from '@/components/cis/empty-notice';
import { Icon } from '@/components/cis/icon';
import { Fixtures } from '@/components/cis/manage-parts';
import { SheetHeading, SheetRule } from '@/components/cis/sheet';
import { StageTracker } from '@/components/cis/stage-tracker';
import { blockTitle, DIVISION_NAME, formatShortDate, sportLabel } from '@/lib/competition/labels';
import { countGames, formatNote, manageActions, nextStep, stageTrack } from '@/lib/competition/manage';

import { sportsHref } from '../data';
import { SportsSheet } from '../parts';
import { selectSports } from '../selection';
import { requireManager } from './guard';
import { ActionsPanel } from './actions-panel';

export const dynamic = 'force-dynamic';

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireManager();
  const sel = await selectSports(await searchParams);
  const { data, division, inDivision, block } = sel;

  const header = <BoardHeader kicker="Admin" title="Manage sports" />;
  const tabs = <DivisionTabs value={division} hrefFor={(d) => sportsHref('/sports/manage', { division: d })} />;

  if (!data.season) {
    return (
      <>
        {header}
        <SportsSheet>
          <EmptyNotice title="No season yet">Sports blocks belong to a season. Start a season first.</EmptyNotice>
        </SportsSheet>
      </>
    );
  }

  const newHref = sportsHref('/sports/manage/new', { division });
  const teamCount = data.teams.filter((t) => t.division === division).length;

  const switcher = (
    <BlockSwitcher
      label="Sport block"
      className="pb-4"
      items={[
        ...inDivision.map((b) => ({
          key: b.id,
          label: sportLabel(b.sport),
          href: sportsHref('/sports/manage', { division, block: b.id }),
          selected: b.id === block?.id,
        })),
        { key: 'new', label: 'New block', href: newHref, selected: false, icon: 'plus' as const },
      ]}
    />
  );

  if (!block) {
    return (
      <>
        {header}
        {tabs}
        <SportsSheet>
          <EmptyNotice
            title="Nothing set up yet"
            action={
              <Link href={newHref} className={`${primaryButtonClasses} w-full`}>
                <Icon name="plus" size={16} strokeWidth={3} />
                New block
              </Link>
            }
          >
            {DIVISION_NAME[division]} has no sport this season. A block is one sport for one division, 3 to 4 weeks long.
          </EmptyNotice>
        </SportsSheet>
      </>
    );
  }

  const games = sel.gamesOf(block.id);
  const counts = countGames(games);
  const actions = manageActions(block, teamCount, games);
  const next = nextStep(block, teamCount, games, DIVISION_NAME[division]);
  const completed = block.status === 'completed';
  const dates =
    block.starts_on && block.ends_on ? ` · ${formatShortDate(block.starts_on)} – ${formatShortDate(block.ends_on)}` : '';

  return (
    <>
      {header}
      {tabs}
      <SportsSheet>
        {switcher}
        <div className="flex items-center justify-between gap-2.5">
          <SheetHeading>{blockTitle(division, block.sport)}</SheetHeading>
          {completed ? (
            <Chip variant="sport">Final</Chip>
          ) : (
            <Link href={`/sports/manage/${block.id}/edit`} className={`${secondaryButtonClasses} min-h-11 px-4 text-cis-base`}>
              <Icon name="edit" size={16} strokeWidth={3} />
              Edit
            </Link>
          )}
        </div>
        <p className="pb-4 pt-1.5 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
          {formatNote(block)}
          {dates}
        </p>

        <StageTracker steps={stageTrack(block)} />

        <div className="pb-3.5 pt-[18px]">
          <div className="text-cis-xs font-bold text-cis-ink-muted">{completed ? 'Status' : 'Next step'}</div>
          <div className="mt-0.5 text-cis-md font-extrabold">{next}</div>
        </div>
        <SheetRule />
        <div className="py-3.5">
          <Fixtures
            items={
              block.status === 'setup'
                ? [
                    { n: teamCount, label: 'teams' },
                    { n: counts.games, label: 'games' },
                    { n: counts.played, label: 'played' },
                  ]
                : [
                    { n: counts.games, label: 'games' },
                    { n: counts.scheduled, label: 'scheduled' },
                    { n: counts.played, label: 'played' },
                  ]
            }
          />
        </div>
        <div className="border-t-2 border-dashed border-cis-rule pt-1">
          <ActionsPanel
            blockId={block.id}
            format={block.format}
            actions={actions}
            primary={
              next === 'Schedule a game day'
                ? 'schedule'
                : actions.knockout.enabled
                  ? 'knockout'
                  : actions.complete.enabled
                    ? 'complete'
                    : 'generate'
            }
            preview={block.status === 'setup' && teamCount >= 6 ? { block, teamCount } : null}
            viewPlaces={completed ? sportsHref('/sports/places', { division, block: block.id }) : null}
          />
        </div>
      </SportsSheet>
    </>
  );
}
