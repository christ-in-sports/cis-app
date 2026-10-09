import Link from 'next/link';

import { BlockSwitcher } from '@/components/cis/block-switcher';
import { BoardHeader } from '@/components/cis/board-shell';
import { secondaryButtonClasses } from '@/components/cis/button';
import { Chip } from '@/components/cis/chip';
import { DivisionTabs } from '@/components/cis/division-tabs';
import { EmptyNotice } from '@/components/cis/empty-notice';
import { LinkRow } from '@/components/cis/link-row';
import { SheetHeading, SheetRule } from '@/components/cis/sheet';
import { StandingsTable } from '@/components/cis/standings-table';
import {
  blockTitle,
  DIVISION_NAME,
  DIVISION_ORDER,
  formatClockMeridiem,
  formatDay,
  sportLabel,
  standingsNote,
} from '@/lib/competition/labels';
import { buildSchedule, standingsView } from '@/lib/competition/view';

import { sportsHref } from './data';
import { UpdatedAt } from './live';
import { SportsSheet } from './parts';
import { selectSports } from './selection';

export const dynamic = 'force-dynamic';

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sel = await selectSports(await searchParams);
  const { data, division, block, choices } = sel;

  const header = <BoardHeader kicker="Sports" title="Standings" meta={<UpdatedAt iso={data.readAt} />} />;
  const tabs = <DivisionTabs value={division} hrefFor={(d) => sportsHref('/sports', { division: d })} />;

  if (!data.season) {
    return (
      <>
        {header}
        <SportsSheet>
          <EmptyNotice title="No season yet">
            Standings show up here once the program team starts a season.
          </EmptyNotice>
        </SportsSheet>
      </>
    );
  }

  if (!block) {
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
                <Link
                  href={sportsHref('/sports', { division: other })}
                  className={`${secondaryButtonClasses} w-full`}
                >
                  View {DIVISION_NAME[other]} standings
                </Link>
              ) : undefined
            }
          >
            The program team hasn&apos;t set up a sport for {DIVISION_NAME[division]} this season. Standings show up
            here as soon as one starts.
          </EmptyNotice>
        </SportsSheet>
      </>
    );
  }

  const games = sel.gamesOf(block.id);
  const view = standingsView(block, sel.teams, games, sel.results);
  const completed = block.status === 'completed';
  const keep = { division, block: block.id };
  const title = blockTitle(division, block.sport);

  // A finished block leads with where everyone ended up.
  const champion = completed
    ? data.places.find((p) => p.sport_block_id === block.id && p.place === 1)
    : undefined;
  const placesRow = completed ? (
    <LinkRow href={sportsHref('/sports/places', keep)} title="Final places">
      {champion
        ? `${sel.teams.get(champion.team_id)?.name ?? 'A team'} finished 1st${block.format === 'league' ? '' : ' after the knockout'}`
        : 'See where every team finished'}
    </LinkRow>
  ) : null;

  const switcher = (
    <BlockSwitcher
      label="Sport"
      className="pb-4"
      items={choices.map((b) => ({
        key: b.id,
        label: sportLabel(b.sport),
        href: sportsHref('/sports', { division, block: b.id }),
        selected: b.id === block.id,
      }))}
    />
  );

  // A knockout-only block has no league table; point at the bracket.
  if (!view) {
    return (
      <>
        {header}
        {tabs}
        <SportsSheet>
          {switcher}
          <div className="flex items-center justify-between gap-2.5 pb-3">
            <SheetHeading>{title}</SheetHeading>
            {completed ? <Chip variant="sport">Final</Chip> : <Chip>Knockout</Chip>}
          </div>
          {placesRow}
          <EmptyNotice title="No league table">
            {sportLabel(block.sport)} is a knockout for {DIVISION_NAME[division]}, so there is no table to rank. Follow
            it in the bracket.
          </EmptyNotice>
          <Link href={sportsHref('/sports/bracket', keep)} className={`${secondaryButtonClasses} mt-3.5 w-full`}>
            See the bracket
          </Link>
        </SportsSheet>
      </>
    );
  }

  // Not started: when and where the first game is.
  const first = !view.started
    ? buildSchedule(games.filter((g) => g.stage === 'league')).flatMap((d) => d.slots.flatMap((s) => s.games))[0]
    : undefined;

  return (
    <>
      {header}
      {tabs}
      <SportsSheet>
        {switcher}
        <div className="flex items-center justify-between gap-2.5 pb-3.5">
          <SheetHeading>{title}</SheetHeading>
          {completed ? (
            <Chip variant="sport">Final</Chip>
          ) : (
            <Chip>{view.chip}</Chip>
          )}
        </div>

        {completed ? (
          placesRow
        ) : block.status === 'knockout' ? (
          <LinkRow href={sportsHref('/sports/bracket', keep)} title="Bracket">
            The knockout is under way
          </LinkRow>
        ) : null}

        {view.tables.map((table, i) => (
          <div key={table.group ?? 'all'}>
            {i > 0 ? <SheetRule className="mb-4 mt-5" /> : null}
            {table.group || completed ? (
              <SheetHeading className="pb-2">{table.group ? `Group ${table.group}` : 'League table'}</SheetHeading>
            ) : null}
            <StandingsTable
              rows={table.rows}
              sport={block.sport}
              started={view.started}
              yourTeamIds={data.myTeamIds}
              caption={table.group ? `Group ${table.group} standings` : `${title} standings`}
            />
          </div>
        ))}

        {first ? (
          <div className="mt-4 border-t-2 border-dashed border-cis-rule-dash pt-4">
            <div className="text-cis-md font-extrabold">First game {formatDay(first.scheduled_date!)}</div>
            <div className="mt-0.5 text-cis-base font-bold text-cis-ink-muted">
              {[
                first.scheduled_time ? formatClockMeridiem(first.scheduled_time) : null,
                first.court ? `Court ${first.court}` : null,
                `${sel.teams.get(first.home_team_id!)?.name ?? 'TBD'} vs. ${sel.teams.get(first.away_team_id!)?.name ?? 'TBD'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <Link href={sportsHref('/sports/schedule', keep)} className={`${secondaryButtonClasses} mt-3.5 w-full`}>
              See schedule
            </Link>
          </div>
        ) : null}

        <p className="mt-3 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
          {!view.started
            ? 'Teams are listed A to Z until a game is played. Ranks appear after the first result.'
            : completed
              ? block.format === 'league'
                ? 'This is the final league table.'
                : 'This is the league table as it ended. Final places also count the knockout.'
              : view.tables.length > 1
                ? `${standingsNote(block.sport)} Each group has its own leader and its own table; teams only play inside their group until the knockout.`
                : standingsNote(block.sport)}
        </p>
      </SportsSheet>
    </>
  );
}
