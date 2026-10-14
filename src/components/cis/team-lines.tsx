/**
 * The two team lines of a game, and the chip that says where the game stands.
 * Shared by the schedule and the bracket, which read a game the same way.
 *
 * The winner is bold and the loser is muted, the score is the display face in
 * ember (a score is the one thing ember marks), and a slot still waiting on an
 * earlier game reads "Winner of Semi-final 1" in the smaller muted style. Colour
 * is never the only signal: the weight changes too, and the chip is a word.
 */

import { Chip } from '@/components/cis/chip';
import type { GameState, TeamLine } from '@/lib/competition/view';
import { cn } from '@/lib/utils';

const TONE: Record<TeamLine['tone'], string> = {
  win: 'font-extrabold',
  loss: 'font-semibold text-cis-ink-muted',
  neutral: 'font-bold',
  waiting: 'text-cis-base font-semibold text-cis-ink-muted',
};

export function TeamLineRow({ line }: { line: TeamLine }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-cis-md leading-[1.35]">
      <span className={cn('min-w-0', TONE[line.tone])}>{line.name}</span>
      {line.score !== null ? (
        <b className="font-cis-display text-cis-xl font-normal text-cis-ember">{line.score}</b>
      ) : null}
    </div>
  );
}

export function TeamLines({ home, away }: { home: TeamLine; away: TeamLine }) {
  return (
    <>
      <TeamLineRow line={home} />
      <TeamLineRow line={away} />
    </>
  );
}

const STATE_CHIP: Record<GameState, { variant: 'sport' | 'active' | 'outline' | 'dashed'; text: string }> = {
  final: { variant: 'sport', text: 'Final' },
  next: { variant: 'active', text: 'Next up' },
  upcoming: { variant: 'outline', text: 'Upcoming' },
  waiting: { variant: 'dashed', text: 'Waiting' },
};

export function GameStateChip({ state }: { state: GameState }) {
  const { variant, text } = STATE_CHIP[state];
  return (
    <Chip variant={variant} size="s">
      {text}
    </Chip>
  );
}
