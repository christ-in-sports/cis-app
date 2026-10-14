import Link from 'next/link';

import { BlockSwitcher } from '@/components/cis/block-switcher';
import { BoardHeader } from '@/components/cis/board-shell';
import { BracketSectionView, RoundJumpChips } from '@/components/cis/bracket';
import { secondaryButtonClasses } from '@/components/cis/button';
import { Chip } from '@/components/cis/chip';
import { ScoreLink } from '@/components/cis/score-link';
import { DivisionTabs } from '@/components/cis/division-tabs';
import { EmptyNotice } from '@/components/cis/empty-notice';
import { SheetHeading } from '@/components/cis/sheet';
import { scoreable } from '@/lib/competition/entry';
import { blockTitle, DIVISION_NAME, plural, sportLabel } from '@/lib/competition/labels';
import { bracketSections } from '@/lib/competition/view';

import { sportsHref } from '../data';
import { UpdatedAt } from '../live';
import { SportsSheet } from '../parts';
import { selectSports } from '../selection';

export const dynamic = 'force-dynamic';

export default async function BracketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A league-only block has no bracket, so it is not offered here.
  const sel = await selectSports(await searchParams, { only: (b) => b.format !== 'league' });
  const { data, division, block, choices } = sel;

  const header = <BoardHeader kicker="Sports" title="Bracket" meta={<UpdatedAt iso={data.readAt} />} />;
  const tabs = <DivisionTabs value={division} hrefFor={(d) => sportsHref('/sports/bracket', { division: d })} />;

  if (!data.season || !block) {
    return (
      <>
        {header}
        {data.season ? tabs : null}
        <SportsSheet>
          <EmptyNotice title="No knockout yet">
            {data.season
              ? `${DIVISION_NAME[division]} has no sport with a knockout this season.`
              : 'The bracket shows up here once the program team starts a season.'}
          </EmptyNotice>
        </SportsSheet>
      </>
    );
  }

  const games = sel.gamesOf(block.id);
  const sections = bracketSections(block, sel.teams, games, sel.results);
  const keep = { division, block: block.id };
  const teamCount = new Set(games.flatMap((g) => [g.home_team_id, g.away_team_id]).filter(Boolean)).size;

  return (
    <>
      {header}
      {tabs}
      <SportsSheet>
        <BlockSwitcher
          label="Sport"
          className="pb-3"
          items={choices.map((b) => ({
            key: b.id,
            label: sportLabel(b.sport),
            href: sportsHref('/sports/bracket', { division, block: b.id }),
            selected: b.id === block.id,
          }))}
        />
        <div className="flex items-center justify-between gap-2.5 pb-3">
          <SheetHeading>{blockTitle(division, block.sport)}</SheetHeading>
          {sections.length > 0 ? <Chip>Knockout · {plural(teamCount, 'team')}</Chip> : null}
        </div>

        {sections.length === 0 ? (
          block.format === 'league_knockout' ? (
            <EmptyNotice
              title="The knockout comes after the league"
              action={
                <Link href={sportsHref('/sports', keep)} className={`${secondaryButtonClasses} w-full`}>
                  See standings
                </Link>
              }
              note={`${games.filter((g) => g.status === 'completed').length} of ${games.length} league games played`}
            >
              The bracket is built from the final league table, so it appears once every league game has a result.
            </EmptyNotice>
          ) : (
            <EmptyNotice title="No bracket yet">
              The program team builds the bracket once the block is ready to start.
            </EmptyNotice>
          )
        ) : (
          <>
            <RoundJumpChips sections={sections} />
            {sections.map((section, i) => (
              <BracketSectionView
                key={section.id}
                section={section}
                first={i === 0}
                renderAction={(g) => {
                  const record = games.find((x) => x.id === g.id);
                  return sel.canScore && record && scoreable(record, block.status) ? (
                    <ScoreLink href={`/sports/score/${g.id}`} played={g.state === 'final'} label={g.label} />
                  ) : null;
                }}
              />
            ))}
          </>
        )}
      </SportsSheet>
    </>
  );
}
