/**
 * One game day of the schedule: a real `<table>` of time, court and game, from the
 * `GameRow` entry in the design system inventory (`DESIGN_SYSTEM.md` §7).
 *
 * Games that share a time share one time cell, so two courts at 9:00 read as one
 * slot. Each game shows its two teams with the score once played, then a chip for
 * where it stands and a line saying which sport and round it is.
 *
 * `action` is where a scorer's "Enter score" / "Edit score" button goes; readers
 * never get one.
 */

import type { ReactNode } from 'react';

import { GameStateChip, TeamLines } from '@/components/cis/team-lines';
import { formatClock } from '@/lib/competition/labels';
import type { GameView } from '@/lib/competition/view';

export interface ScheduleGameItem {
  id: string;
  court: number | null;
  view: GameView;
  /** "Soccer · Round 1". */
  meta: string;
  action?: ReactNode;
}

export interface ScheduleSlotItem {
  time: string | null;
  games: ScheduleGameItem[];
}

export function ScheduleTable({ slots, caption }: { slots: readonly ScheduleSlotItem[]; caption: string }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col style={{ width: '56px' }} />
        <col style={{ width: '44px' }} />
        <col />
      </colgroup>
      <thead>
        <tr className="border-b-4 border-cis-ink-dark text-left">
          <th scope="col" className="pb-2 text-cis-xs font-bold text-cis-ink-muted">
            Time
          </th>
          <th scope="col" className="pb-2 text-center text-cis-xs font-bold text-cis-ink-muted">
            Court
          </th>
          <th scope="col" className="pb-2 text-cis-xs font-bold text-cis-ink-muted">
            Game
          </th>
        </tr>
      </thead>
      <tbody>
        {slots.flatMap((slot) =>
          slot.games.map((game, i) => (
            <tr key={game.id} className="border-b border-cis-rule">
              {i === 0 ? (
                <th scope="rowgroup" rowSpan={slot.games.length} className="pt-3.5 text-left align-top text-cis-base font-extrabold">
                  {slot.time ? formatClock(slot.time) : 'TBD'}
                </th>
              ) : null}
              <td className="pt-3 text-center align-top text-cis-md font-extrabold">{game.court ?? '–'}</td>
              <td className="py-3 align-top">
                <TeamLines home={game.view.home} away={game.view.away} />
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-cis-xs font-bold text-cis-ink-muted">
                  <GameStateChip state={game.view.state} />
                  {game.meta}
                </div>
                {game.action}
              </td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}
