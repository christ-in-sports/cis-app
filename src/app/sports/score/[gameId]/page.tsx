import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BoardHeader } from '@/components/cis/board-shell';
import { primaryButtonClasses, secondaryButtonClasses } from '@/components/cis/button';
import { EmptyNotice } from '@/components/cis/empty-notice';
import { Icon } from '@/components/cis/icon';
import { ScoreNumber } from '@/components/cis/score-controls';
import { SheetHeading, SheetRule } from '@/components/cis/sheet';
import { startingDetails, nextOnCourt, scoreable } from '@/lib/competition/entry';
import {
  blockTitle,
  formatClock,
  ordinal,
} from '@/lib/competition/labels';
import { sportSettings } from '@/lib/competition/scores';
import type { GameRecord, TeamRecord } from '@/lib/competition/types';
import { standingsView } from '@/lib/competition/view';

import { getSportsData, param, sportsHref } from '../../data';
import { PlainSheet } from '../../parts';
import { ScoreForm } from './score-form';

export const dynamic = 'force-dynamic';

function gameKicker(game: GameRecord): string {
  const parts = [game.label];
  if (game.court !== null) parts.push(`Court ${game.court}`);
  if (game.scheduled_time) parts.push(formatClock(game.scheduled_time));
  return parts.join(' · ');
}

export default async function ScorePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gameId } = await params;
  const sp = await searchParams;
  const { data, canScore } = await getSportsData();

  const game = data.games.find((g) => g.id === gameId);
  if (!game) notFound();
  const block = data.blocks.find((b) => b.id === game.sport_block_id);
  if (!block) notFound();

  const division = block.division;
  const backHref = sportsHref('/sports/schedule', { division, block: block.id });
  const header = (title: string, kicker?: string) => (
    <BoardHeader
      kicker={kicker ?? gameKicker(game)}
      title={title}
      action={
        <Link
          href={backHref}
          aria-label="Close"
          className="flex size-11 items-center justify-center rounded-cis-pill border-[3px] border-cis-ink-on-dark text-cis-ink-on-dark"
        >
          <Icon name="close" />
        </Link>
      }
    />
  );

  // Reading scores is open to everyone; changing them is not. A reader who follows
  // a link here lands on the schedule instead of an empty form.
  if (!canScore) redirect(backHref);

  const teams = new Map<string, TeamRecord>(data.teams.map((t) => [t.id, t]));
  const results = new Map(data.results.map((r) => [r.game_id, r]));
  const blockGames = data.games.filter((g) => g.sport_block_id === block.id);
  const saved = results.get(game.id);
  const name = (id: string | null) => (id ? (teams.get(id)?.name ?? 'Unknown team') : 'A team');
  const title = blockTitle(division, block.sport);

  // ---- Saved ---------------------------------------------------------------
  if (param(sp, 'saved') === '1' && saved) {
    const view = block.format === 'knockout' || game.stage !== 'league' ? null : standingsView(block, teams, blockGames, results);
    const rows = view?.tables.flatMap((t) => t.rows) ?? [];
    const standing = (id: string | null) => rows.find((r) => r.teamId === id);
    const place = (id: string | null) => {
      const r = standing(id);
      return r && view?.started ? `${name(id)} ${ordinal(r.rank)} on ${r.points} points` : null;
    };
    const standingsLine =
      game.stage === 'league'
        ? [place(game.home_team_id), place(game.away_team_id)].filter(Boolean).join(', ')
        : null;
    const winner = saved.winner_team_id;
    const advances =
      game.stage !== 'league' && game.winner_to_game_id
        ? blockGames.find((g) => g.id === game.winner_to_game_id)
        : null;
    const next = nextOnCourt(game, blockGames);
    const nextHref = next && scoreable(next, block.status) ? sportsHref(`/sports/score/${next.id}`, {}) : null;
    const loser = (id: string | null) => winner !== null && id !== winner;

    return (
      <>
        {header('Score saved')}
        <PlainSheet>
          <div className="flex items-center gap-3 pb-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border-[3px] border-cis-ink bg-cis-orange text-cis-ink-dark">
              <Icon name="check" size={24} strokeWidth={3.4} />
            </div>
            <div>
              <SheetHeading>Saved to the schedule</SheetHeading>
              <div className="mt-0.5 text-cis-xs font-bold text-cis-ink-muted">
                {title} · {game.label}
              </div>
            </div>
          </div>
          <SheetRule />
          <div className="py-4">
            {([game.home_team_id, game.away_team_id] as const).map((id, i) => (
              <div key={i} className={`flex items-center justify-between ${i ? 'mt-1' : ''}`}>
                <span
                  className={`font-cis-display text-[30px] leading-[1.1] ${loser(id) ? 'text-cis-ink-muted' : ''}`}
                >
                  {name(id)}
                </span>
                <ScoreNumber value={i === 0 ? saved.home_total : saved.away_total} size="sm" />
              </div>
            ))}
          </div>
          {standingsLine || advances ? (
            <>
              <div className="border-t-2 border-dashed border-cis-rule py-3.5">
                <div className="text-cis-xs font-bold text-cis-ink-muted">{standingsLine ? 'Standings now' : 'Bracket now'}</div>
                <div className="mt-0.5 text-cis-md font-medium leading-[1.4]">
                  {standingsLine || `${name(winner)} advance to ${advances!.label}.`}
                </div>
              </div>
            </>
          ) : null}
          {next ? (
            <>
              <SheetRule />
              <div className="pt-3.5">
                <div className="text-cis-xs font-bold text-cis-ink-muted">Next on Court {next.court}</div>
                <div className="mt-0.5 text-cis-md font-extrabold">
                  {next.scheduled_time ? formatClock(next.scheduled_time) : 'TBD'} ·{' '}
                  {next.home_team_id && next.away_team_id
                    ? `${name(next.home_team_id)} vs. ${name(next.away_team_id)}`
                    : next.label}
                </div>
              </div>
            </>
          ) : null}
          <div className="mt-[18px] flex flex-col gap-3">
            {nextHref ? (
              <Link href={nextHref} className={primaryButtonClasses}>
                Score next game
              </Link>
            ) : null}
            <Link href={backHref} className={secondaryButtonClasses}>
              Back to schedule
            </Link>
          </div>
        </PlainSheet>
      </>
    );
  }

  // ---- Can't be scored -----------------------------------------------------
  if (!scoreable(game, block.status)) {
    const why = !game.home_team_id || !game.away_team_id
      ? 'Both teams have to be known first. They come from earlier games that have not been played yet.'
      : block.status === 'completed'
        ? 'This block is completed. Reset it to change results.'
        : 'League results are locked once the knockout stage has been created.';
    return (
      <>
        {header('Score entry')}
        <PlainSheet>
          <EmptyNotice title="This game can't be scored" action={<Link href={backHref} className={`${secondaryButtonClasses} w-full`}>Back to schedule</Link>}>
            {why}
          </EmptyNotice>
        </PlainSheet>
      </>
    );
  }

  // ---- Entry ---------------------------------------------------------------
  const settings = sportSettings(block.sport, block.settings ?? {});
  const initial = startingDetails(block.sport, settings, saved);
  const tiebreakSide = !saved?.tiebreak_winner_team_id
    ? null
    : saved.tiebreak_winner_team_id === game.home_team_id
      ? ('home' as const)
      : ('away' as const);

  const knockout = game.stage !== 'league';
  const series =
    block.sport === 'volleyball'
      ? `best of ${settings.maxSets ?? 5}`
      : block.sport === 'dodgeball'
        ? `best of ${settings.maxRounds ?? 5}`
        : null;
  const chip = knockout
    ? `Knockout · no draws${series ? ` · ${series}` : ''}`
    : series
      ? `League · ${series}`
      : 'League · draw allowed';

  const recordedNote = saved
    ? `Recorded result: ${name(game.home_team_id)} ${saved.home_total}–${saved.away_total} ${name(game.away_team_id)}`
    : null;

  const there = (id: string, extra: Record<string, string> = {}) => `/sports/score/${id}${Object.keys(extra).length ? `?${new URLSearchParams(extra)}` : ''}`;

  return (
    <>
      {header(saved ? 'Edit score' : 'Score entry')}
      <ScoreForm
        key={game.id}
        game={game}
        games={blockGames}
        teams={data.teams}
        sport={block.sport}
        settings={settings}
        title={title}
        chip={chip}
        saved={saved}
        initialDetails={initial}
        initialTiebreak={tiebreakSide}
        recordedNote={recordedNote}
        backHref={backHref}
        savedHref={there(game.id, { saved: '1' })}
      />
    </>
  );
}
