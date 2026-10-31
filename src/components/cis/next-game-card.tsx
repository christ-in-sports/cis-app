/**
 * `NextGameCard`: the game Today leads with (`nextGame` picks it).
 *
 * The teams in the display face, and the time on a logo-orange badge with dark
 * text: orange is the game (`DESIGN_SYSTEM.md` §4). The badge is a label, not a
 * button; the one link is "Full schedule". Shown only when there is a game.
 */

import Link from 'next/link';

import { Chip } from '@/components/cis/chip';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import { blockTitle, formatClock, formatDay } from '@/lib/competition/labels';
import type { NextGame } from '@/lib/competition/next-game';

export function NextGameCard({
  next,
  today,
  scheduleHref,
}: {
  next: NextGame;
  /** `YYYY-MM-DD`, to say "Today" instead of the date. */
  today: string;
  scheduleHref: string;
}) {
  const { game, block, home, away, mine } = next;
  const day = game.scheduled_date === today ? 'Today' : formatDay(game.scheduled_date!);
  const [h] = (game.scheduled_time ?? '').split(':').map(Number);

  return (
    <Sheet className="px-cis-5 pb-cis-4 pt-cis-4">
      <div className="flex items-center justify-between gap-cis-2">
        <SheetHeading>{mine ? 'Your next game' : 'Next game'}</SheetHeading>
        <span className="text-cis-xs font-bold text-cis-ink-muted">{day}</span>
      </div>
      <SheetRule className="mt-2.5" />
      <div className="mt-cis-3 flex items-center justify-between gap-cis-3">
        <div className="min-w-0 font-cis-display text-cis-display-md leading-[1.05]">
          <div className="break-words">{home}</div>
          <div className="font-cis-body text-cis-xs font-bold leading-[1.7] text-cis-ink-muted">vs.</div>
          <div className="break-words">{away}</div>
        </div>
        <div className="shrink-0 rounded-cis-chip bg-cis-sport px-cis-3 pb-1.5 pt-2 text-center text-cis-ink-on-sport">
          <div className="font-cis-display text-cis-display-md leading-none">
            {game.scheduled_time ? formatClock(game.scheduled_time) : 'TBD'}
          </div>
          <div className="mt-0.5 text-cis-xs font-extrabold">
            {[game.scheduled_time ? (h < 12 ? 'AM' : 'PM') : null, game.court ? `Court ${game.court}` : null]
              .filter(Boolean)
              .join(' · ') || 'Time to come'}
          </div>
        </div>
      </div>
      <div className="mt-cis-3 flex items-center justify-between gap-cis-2 border-t-2 border-dashed border-cis-rule-dash pt-cis-3">
        <Chip variant="result" size="s">
          {blockTitle(block.division, block.sport)}
        </Chip>
        <Link
          href={scheduleHref}
          className="text-cis-sm font-extrabold text-cis-action underline underline-offset-2 hover:text-cis-action-hover"
        >
          Full schedule
        </Link>
      </div>
    </Sheet>
  );
}
