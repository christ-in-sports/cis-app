import Link from 'next/link';

import { BlockSwitcher } from '@/components/cis/block-switcher';
import { BoardHeader } from '@/components/cis/board-shell';
import { secondaryButtonClasses } from '@/components/cis/button';
import { DivisionTabs } from '@/components/cis/division-tabs';
import { EmptyNotice } from '@/components/cis/empty-notice';
import { ScoreLink } from '@/components/cis/score-link';
import { ScheduleTable } from '@/components/cis/schedule-table';
import { SheetHeading, SheetRule } from '@/components/cis/sheet';
import {
  DIVISION_NAME,
  DIVISION_ORDER,
  formatDay,
  formatShortDate,
  sportLabel,
} from '@/lib/competition/labels';
import { scoreable } from '@/lib/competition/entry';
import type { GameRecord } from '@/lib/competition/types';
import { buildSchedule, dayNote, gameMeta, gameView, nextUpIds } from '@/lib/competition/view';

import { param, sportsHref } from '../data';
import { UpdatedAt } from '../live';
import { SportsSheet } from '../parts';
import { selectSports } from '../selection';

export const dynamic = 'force-dynamic';

/** "soccer", "soccer and basketball", "soccer, basketball and dodgeball". */
function sportList(sports: string[]): string {
  const names = sports.map((s) => sportLabel(s).toLowerCase());
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sel = await selectSports(sp);
  const { data, division, inDivision } = sel;

  const header = <BoardHeader kicker="Sports" title="Schedule" meta={<UpdatedAt iso={data.readAt} />} />;
  const tabs = <DivisionTabs value={division} hrefFor={(d) => sportsHref('/sports/schedule', { division: d })} />;

  if (!data.season) {
    return (
      <>
        {header}
        <SportsSheet>
          <EmptyNotice title="No season yet">The schedule shows up here once the program team starts a season.</EmptyNotice>
        </SportsSheet>
      </>
    );
  }

  if (inDivision.length === 0) {
    const other = DIVISION_ORDER.find((d) => d !== division && data.blocks.some((b) => b.division === d));
    return (
      <>
        {header}
        {tabs}
        <SportsSheet>
          <EmptyNotice
            title="Nothing set up yet"
            note={other ? `${DIVISION_NAME[other]} already has a sport running. Switch tabs to see it.` : undefined}
            action={
              other ? (
                <Link href={sportsHref('/sports/schedule', { division: other })} className={`${secondaryButtonClasses} w-full`}>
                  View {DIVISION_NAME[other]} schedule
                </Link>
              ) : undefined
            }
          >
            The program team hasn&apos;t set up a sport for {DIVISION_NAME[division]} this season.
          </EmptyNotice>
        </SportsSheet>
      </>
    );
  }

  // Filters: one block, or all; and optionally only the viewer's own team.
  const filterBlock = inDivision.find((b) => b.id === param(sp, 'block')) ?? null;
  const mine = param(sp, 'mine') === '1';
  const myIds = new Set(data.myTeamIds.filter((id) => sel.teams.get(id)?.division === division));

  const blockById = new Map(inDivision.map((b) => [b.id, b]));
  const divisionGames = data.games.filter((g) => blockById.has(g.sport_block_id));
  const byBlock = new Map<string, GameRecord[]>();
  for (const g of divisionGames) byBlock.set(g.sport_block_id, [...(byBlock.get(g.sport_block_id) ?? []), g]);

  // "Next up" is the next slot in the whole division, whatever filter is on.
  const next = nextUpIds(divisionGames);
  const shown = filterBlock ? divisionGames.filter((g) => g.sport_block_id === filterBlock.id) : divisionGames;
  const filtered = mine && myIds.size > 0;
  const days = buildSchedule(shown, { teamIds: filtered ? myIds : undefined });

  const hrefWith = (over: { block?: string | null; mine?: boolean }) =>
    sportsHref('/sports/schedule', {
      division,
      block: over.block === undefined ? filterBlock?.id : over.block,
      mine: (over.mine ?? mine) ? '1' : null,
    });

  const [onlyTeam] = myIds;
  const chips = [
    { key: 'all', label: 'All blocks', href: hrefWith({ block: null }), selected: !filterBlock },
    ...inDivision.map((b) => ({
      key: b.id,
      label: sportLabel(b.sport),
      href: hrefWith({ block: b.id }),
      selected: filterBlock?.id === b.id,
    })),
    ...(myIds.size > 0
      ? [
          {
            key: 'mine',
            label: myIds.size === 1 ? `${sel.teams.get(onlyTeam)?.name ?? 'Your team'} only` : 'Your teams only',
            href: hrefWith({ mine: !mine }),
            selected: mine,
            tick: true,
          },
        ]
      : []),
  ];

  const unscheduledEverywhere = divisionGames.every((g) => !g.scheduled_date);
  const seasonRuns =
    data.season.starts_on && data.season.ends_on
      ? `Season runs ${formatShortDate(data.season.starts_on)} – ${formatShortDate(data.season.ends_on)}`
      : data.season.starts_on
        ? `Season starts ${formatShortDate(data.season.starts_on)}`
        : null;

  return (
    <>
      {header}
      {tabs}
      <SportsSheet>
        <BlockSwitcher label="Filter the schedule" items={chips} className="pb-4" />

        {days.length === 0 ? (
          unscheduledEverywhere ? (
            <EmptyNotice title="No games scheduled yet" note={seasonRuns ?? undefined}>
              The program team has set up {DIVISION_NAME[division]} {sportList(inDivision.map((b) => b.sport))} but
              hasn&apos;t picked game days. Check back once dates are posted.
            </EmptyNotice>
          ) : (
            <EmptyNotice title="No games to show">
              {filtered
                ? 'Your team’s games show up here once they are scheduled.'
                : 'Nothing is scheduled for this block yet.'}
            </EmptyNotice>
          )
        ) : (
          <>
            {days.map((day, i) => (
              <div key={day.date}>
                {i > 0 ? <SheetRule className="mb-4 mt-[22px]" /> : null}
                <div className="flex items-baseline justify-between gap-2.5 pb-2.5">
                  <SheetHeading>{formatDay(day.date)}</SheetHeading>
                  <div className="text-cis-sm font-bold text-cis-ink-muted">{dayNote(day, filtered)}</div>
                </div>
                <ScheduleTable
                  caption={`Games on ${formatDay(day.date)}`}
                  slots={day.slots.map((slot) => ({
                    time: slot.time,
                    games: slot.games.map((g) => {
                      const block = blockById.get(g.sport_block_id)!;
                      const view = gameView(g, {
                        sport: block.sport,
                        teams: sel.teams,
                        games: byBlock.get(g.sport_block_id) ?? [],
                        results: sel.results,
                        next,
                      });
                      return {
                        id: g.id,
                        court: g.court,
                        view,
                        meta: gameMeta(block.sport, view),
                        action:
                          sel.canScore && scoreable(g, block.status) ? (
                            <ScoreLink href={`/sports/score/${g.id}`} played={view.state === 'final'} label={view.label} />
                          ) : undefined,
                      };
                    }),
                  }))}
                />
              </div>
            ))}
            <p className="mt-3 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
              Final: played, with score. Next up: the next slot to start. Upcoming: teams known, not started. Waiting: a
              team comes from an earlier game.
            </p>
          </>
        )}
      </SportsSheet>
    </>
  );
}
