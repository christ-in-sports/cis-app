'use client';

/**
 * The score entry sheet (ENG-15 part 2): one game, in the controls that suit its
 * sport, saved with the `recordResult` Server Action.
 *
 * Saving locks the controls and says "Saving…" (no spinner), keeping the sheet
 * open until the database has answered, because a result also moves the winner
 * and loser into later games. A correction that would swap a team in a game that
 * has already been played is refused up front with the game named, as the
 * database would refuse it anyway; clearing a result asks first and lists what it
 * undoes. Errors use the danger colour and a warning icon, never ember, which is
 * kept for scores.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { DangerButton, PrimaryButton, SecondaryButton, secondaryButtonClasses } from '@/components/cis/button';
import { Chip } from '@/components/cis/chip';
import { Icon } from '@/components/cis/icon';
import {
  PickButton,
  QuickPoints,
  RoundWinnerPicker,
  ScoreNumber,
  ScoreStepper,
  SetTable,
} from '@/components/cis/score-controls';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import {
  blockingGame,
  bump,
  bumpSet,
  clearImpact,
  defaultActiveSet,
  entryTotals,
  isLevel,
  neededCount,
  pickRound,
  playedDownstream,
  roundWinners,
  setWinners,
  tiebreakAsk,
  tiebreakWord,
  trimDetails,
  type PointsDetails,
  type RoundsDetails,
  type SetsDetails,
} from '@/lib/competition/entry';
import type { Side, SportSettings } from '@/lib/competition/scores';
import type { GameRecord, ResultRecord, TeamRecord } from '@/lib/competition/types';

import { clearResult, recordResult } from '../../actions';

export interface ScoreFormProps {
  game: GameRecord;
  /** Every game in the block, to find what this one feeds. */
  games: GameRecord[];
  teams: TeamRecord[];
  sport: string;
  settings: SportSettings;
  /** "Juniors soccer". */
  title: string;
  /** "League · draw allowed". */
  chip: string;
  saved: ResultRecord | undefined;
  initialDetails: unknown;
  initialTiebreak: Side | null;
  /** "Recorded result: Falcons 2–1 Anchors", for a game already played. */
  recordedNote: string | null;
  backHref: string;
  /** Where to go after a save, to show the saved panel. */
  savedHref: string;
}

const UNIT: Record<string, string> = { soccer: 'goal', basketball: 'point' };

function ErrorNote({ children }: { children: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 py-3 text-cis-base font-bold leading-[1.4] text-cis-danger">
      <Icon name="warning" size={24} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ScoreForm(props: ScoreFormProps) {
  const { game, games, sport, settings, saved } = props;
  const router = useRouter();
  const [pending, start] = useTransition();

  const [details, setDetails] = useState<unknown>(props.initialDetails);
  const [tiebreak, setTiebreak] = useState<Side | null>(props.initialTiebreak);
  const [activeSet, setActiveSet] = useState(() =>
    sport === 'volleyball' ? defaultActiveSet(props.initialDetails as SetsDetails) : 0
  );
  const [error, setError] = useState<string | null>(null);
  const [needsTiebreak, setNeedsTiebreak] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const teamName = (id: string | null) => props.teams.find((t) => t.id === id)?.name ?? 'Unknown team';
  const names = { home: teamName(game.home_team_id), away: teamName(game.away_team_id) };

  const totals = entryTotals(sport, details, settings);
  const knockout = game.stage !== 'league';
  const level = isLevel(totals);
  const askTiebreak = knockout && level;

  const winnerSide: Side | null =
    totals && !level ? (totals.home > totals.away ? 'home' : 'away') : askTiebreak ? tiebreak : null;
  const blocker = blockingGame(game, games, saved, winnerSide);
  const clearBlocker = playedDownstream(game, games);

  const edit = (next: unknown) => {
    setDetails(next);
    setError(null);
    setNeedsTiebreak(false);
  };

  const save = () => {
    if (askTiebreak && !tiebreak) {
      setNeedsTiebreak(true);
      setError(null);
      return;
    }
    start(async () => {
      const result = await recordResult({
        gameId: game.id,
        details: trimDetails(sport, details),
        tiebreakWinner: askTiebreak ? tiebreak : null,
      });
      if (result.ok) router.replace(props.savedHref);
      else setError(result.error);
    });
  };

  const clear = () =>
    start(async () => {
      const result = await clearResult({ gameId: game.id });
      if (result.ok) router.replace(props.backHref);
      else {
        setConfirmingClear(false);
        setError(result.error);
      }
    });

  const link = (id: string, label: string) => (
    <Link href={`/sports/score/${id}`} className={`${secondaryButtonClasses} mt-1 w-full text-cis-base`}>
      Open {label}
      <Icon name="arrow" size={16} strokeWidth={3} />
    </Link>
  );

  // ---- Clear confirmation --------------------------------------------------
  if (confirmingClear && saved) {
    const lines = clearImpact(game, games, new Map(props.teams.map((t) => [t.id, t])));
    return (
      <Sheet className="mx-3.5 mb-3.5 mt-1.5 px-[18px] pb-[22px] pt-5">
        <h2 className="pb-3 font-cis-display text-cis-xl font-normal leading-[1.15]">Clear {game.label}?</h2>
        <SheetRule />
        <div className="py-3.5">
          <div className="text-cis-xs font-bold text-cis-ink-muted">This result will be removed</div>
          <div className="pt-1 font-cis-display text-cis-xl leading-[1.2]">
            {names.home} {saved.home_total} – {saved.away_total} {names.away}
          </div>
        </div>
        <div className="border-t-2 border-dashed border-cis-rule py-3.5">
          <div className="text-cis-xs font-bold text-cis-ink-muted">What changes after that</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-cis-md font-semibold leading-[1.4]">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <SheetRule />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="flex flex-col gap-3 pt-4">
          <DangerButton block disabled={pending} onClick={clear}>
            <Icon name="trash" size={16} strokeWidth={3} />
            {pending ? 'Clearing…' : 'Clear result'}
          </DangerButton>
          <SecondaryButton block disabled={pending} onClick={() => setConfirmingClear(false)}>
            Keep result
          </SecondaryButton>
        </div>
      </Sheet>
    );
  }

  // ---- The sheet -----------------------------------------------------------
  const lead = (
    <div className="flex items-center justify-between gap-2.5 pb-3">
      <SheetHeading>{props.title}</SheetHeading>
      <Chip variant={saved ? 'sport' : 'tint'}>{saved ? 'Final' : props.chip}</Chip>
    </div>
  );

  let body;
  if (sport === 'soccer' || sport === 'basketball') {
    const d = details as PointsDetails;
    const unit = UNIT[sport];
    body = (['home', 'away'] as const).map((side, i) => (
      <div key={side} className={i === 0 ? 'pb-[18px] pt-4' : 'border-t-2 border-dashed border-cis-rule pb-1.5 pt-4'}>
        <div className="flex items-baseline justify-between">
          <div className="font-cis-display text-cis-display-md leading-[1.1]">{names[side]}</div>
          <div className="text-cis-xs font-bold text-cis-ink-muted">{side === 'home' ? 'Home' : 'Away'}</div>
        </div>
        {sport === 'soccer' ? (
          <div className="mt-2">
            <ScoreStepper
              value={d[side]}
              unit={unit}
              teamName={names[side]}
              disabled={pending}
              onChange={(delta) => edit(bump(d, side, delta))}
            />
          </div>
        ) : (
          <>
            <div className="mt-1 text-right">
              <ScoreNumber value={d[side]} />
            </div>
            <QuickPoints
              teamName={names[side]}
              disabled={pending}
              canUndo={d[side] > 0}
              onChange={(delta) => edit(bump(d, side, delta))}
            />
          </>
        )}
      </div>
    ));
  } else if (sport === 'volleyball') {
    const d = details as SetsDetails;
    const needed = neededCount(setWinners(d));
    const active = Math.min(activeSet, needed - 1);
    body = (
      <>
        <SeriesTotal totals={totals} names={names} noun="sets won" />
        <SetTable sets={d.sets} needed={needed} active={active} names={names} onSelect={setActiveSet} />
        <div className="mt-3.5 border-t-2 border-dashed border-cis-rule" />
        <SheetHeading className="pb-2 pt-3.5">Set {active + 1} points</SheetHeading>
        <div className="flex gap-2.5">
          {(['home', 'away'] as const).map((side) => (
            <div key={side} className="flex-1 text-center">
              <div className="text-cis-xs font-bold text-cis-ink-muted">{names[side]}</div>
              <ScoreStepper
                size="md"
                value={d.sets[active][side]}
                unit="point"
                teamName={names[side]}
                disabled={pending}
                onChange={(delta) => edit(bumpSet(d, active, side, delta))}
              />
            </div>
          ))}
        </div>
        <p className="pt-3.5 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
          The higher score wins the set. Tap a set row to edit it. Later sets are only needed if neither team has won
          the series.
        </p>
      </>
    );
  } else {
    const d = details as RoundsDetails;
    const needed = neededCount(roundWinners(d));
    body = (
      <>
        <SeriesTotal totals={totals} names={names} noun="rounds won" />
        <RoundWinnerPicker
          rounds={d.rounds}
          needed={needed}
          names={names}
          disabled={pending}
          onPick={(i, side) => edit(pickRound(d, i, side))}
        />
        <p className="pt-2.5 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
          Tap a name to record the round. Tap it again to clear it.
        </p>
      </>
    );
  }

  const footnote =
    sport === 'soccer'
      ? 'Goals scored, full time.'
      : sport === 'basketball'
        ? 'Tap a quick button for each basket. −1 fixes a mis-tap.'
        : null;

  return (
    <Sheet className="mx-3.5 mb-3.5 mt-1.5 px-[18px] pb-[22px] pt-5">
      {lead}
      {props.recordedNote ? (
        <p className="pb-2.5 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">{props.recordedNote}</p>
      ) : null}
      <SheetRule />
      {body}
      {footnote ? (
        <p className="pt-3 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
          {footnote} {!knockout ? 'Level scores are saved as a draw.' : ''}
        </p>
      ) : null}

      {askTiebreak ? (
        <div className="mt-3.5">
          <SheetRule />
          <div className="pt-3.5">
            <SheetHeading>Level after full time</SheetHeading>
            <p className="mb-3 mt-1 text-cis-md font-medium leading-[1.4]">{tiebreakAsk(sport)}</p>
            <div className={needsTiebreak ? 'flex gap-2.5 rounded-cis-box outline outline-[3px] outline-offset-[6px] outline-cis-danger' : 'flex gap-2.5'}>
              {(['home', 'away'] as const).map((side) => (
                <PickButton
                  key={side}
                  picked={tiebreak === side}
                  disabled={pending}
                  onClick={() => {
                    setTiebreak(side);
                    setNeedsTiebreak(false);
                    setError(null);
                  }}
                >
                  {names[side]}
                </PickButton>
              ))}
            </div>
            {needsTiebreak ? (
              <ErrorNote>{`Can't save yet. A knockout game can't end level, so pick who won ${tiebreakWord(sport)}.`}</ErrorNote>
            ) : null}
          </div>
        </div>
      ) : null}

      {blocker ? (
        <div className="mt-2 border-t-2 border-cis-danger">
          <ErrorNote>{`Can't change the winner. ${blocker.label} has already been played with the teams this result sent there. Clear that result first.`}</ErrorNote>
          {link(blocker.id, blocker.label)}
        </div>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {saved ? (
        <div className="mt-4 border-t-2 border-dashed border-cis-rule pt-4">
          {clearBlocker ? (
            <>
              <DangerButton block disabled>
                <Icon name="trash" size={16} strokeWidth={3} />
                Clear this result
              </DangerButton>
              <p className="pt-2 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
                {`Blocked until ${clearBlocker.label} is cleared, because this game's teams already played there.`}
              </p>
            </>
          ) : (
            <>
              <DangerButton block disabled={pending} onClick={() => setConfirmingClear(true)}>
                <Icon name="trash" size={16} strokeWidth={3} />
                Clear this result
              </DangerButton>
              <p className="pt-2 text-cis-xs font-bold leading-[1.45] text-cis-ink-muted">
                Sends this game back to upcoming.
              </p>
            </>
          )}
        </div>
      ) : null}

      <div className="-mx-[18px] -mb-[22px] mt-5 flex gap-2.5 border-t-[5px] border-cis-ink-dark px-3.5 pb-5 pt-3.5">
        <Link
          href={props.backHref}
          aria-disabled={pending}
          className={`${secondaryButtonClasses} px-5 text-cis-base ${pending ? 'pointer-events-none opacity-60' : ''}`}
        >
          Cancel
        </Link>
        <PrimaryButton className="flex-1" disabled={pending || blocker !== null} onClick={save}>
          {pending ? 'Saving…' : 'Save score'}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/** "2 – 1" with its noun underneath: the running total for volleyball and dodgeball. */
function SeriesTotal({
  totals,
  names,
  noun,
}: {
  totals: { home: number; away: number } | null;
  names: { home: string; away: string };
  noun: string;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex-1 text-center font-cis-display text-cis-xl leading-[1.1]">{names.home}</div>
      <div className="shrink-0 text-center">
        <div className="flex items-center justify-center gap-3.5">
          <ScoreNumber value={totals?.home ?? 0} size="md" />
          <span className="font-cis-display text-cis-display-lg text-cis-ink-muted">–</span>
          <ScoreNumber value={totals?.away ?? 0} size="md" />
        </div>
        <div className="text-cis-xs font-bold text-cis-ink-muted">{noun}</div>
      </div>
      <div className="flex-1 text-center font-cis-display text-cis-xl leading-[1.1]">{names.away}</div>
    </div>
  );
}
