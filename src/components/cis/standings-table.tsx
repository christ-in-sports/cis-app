'use client';

/**
 * `StandingsTable`, from the design system's component inventory (`DESIGN_SYSTEM.md` §7).
 *
 * A real `<table>` with sortable header buttons, not a card grid (§3). Tapping a
 * header sorts by it; tapping it again flips the direction. **Rank never moves**:
 * it comes from `rankStandings` (points, then head-to-head, then difference) and
 * travels with the row, so sorting by name still shows who is first (§8).
 *
 * The last two columns are named for the sport: GD/GF for soccer, PD/PF for
 * basketball, SD/SW for volleyball, RD/RW for dodgeball. The leader's row takes
 * the ember wash, and a team the viewer cares about is flagged with an apricot
 * "Your team" chip under its name, since the leader wash is taken.
 *
 * Before a game is played there is nothing to rank: ranks show a dash and the
 * headers are plain text, because a sort would have nothing to say.
 */

import { useState } from 'react';

import { Chip } from '@/components/cis/chip';
import { sportColumns } from '@/lib/competition/scores';
import {
  defaultDir,
  record,
  signed,
  sortRows,
  type SortDir,
  type SortKey,
  type StandingsRowView,
} from '@/lib/competition/view';
import { cn } from '@/lib/utils';

interface Column {
  key: SortKey;
  label: string;
  /** `l`, `c` or `r`: where the text sits. */
  align: 'l' | 'c' | 'r';
  width?: string;
}

export function StandingsTable({
  rows,
  sport,
  started,
  yourTeamIds,
  caption,
}: {
  rows: readonly StandingsRowView[];
  sport: string;
  started: boolean;
  yourTeamIds: readonly string[];
  /** What the table is, for assistive technology ("Group A standings"). */
  caption: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'points', dir: 'desc' });
  const { difference, scored } = sportColumns(sport);

  const columns: Column[] = [
    { key: 'team', label: 'Team', align: 'l' },
    { key: 'played', label: 'P', align: 'c', width: '26px' },
    { key: 'record', label: 'W–D–L', align: 'c', width: '58px' },
    { key: 'difference', label: difference, align: 'r', width: '36px' },
    { key: 'scored', label: scored, align: 'r', width: '34px' },
    { key: 'points', label: 'Pts', align: 'r', width: '32px' },
  ];

  const shown = started ? sortRows(rows, sort.key, sort.dir) : rows;
  const press = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }));

  const align = { l: 'text-left', c: 'text-center', r: 'text-right' } as const;

  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col style={{ width: '24px' }} />
        {columns.map((c) => (
          <col key={c.key} style={c.width ? { width: c.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b-4 border-cis-ink-dark">
          <th scope="col" className="pb-2 text-center text-cis-xs font-bold text-cis-ink-muted">
            <span aria-hidden>#</span>
            <span className="sr-only">Rank</span>
          </th>
          {columns.map((c) => {
            const active = started && sort.key === c.key;
            return (
              <th
                key={c.key}
                scope="col"
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={cn('pb-2 text-cis-xs font-bold text-cis-ink-muted', align[c.align])}
              >
                {started ? (
                  <button
                    type="button"
                    onClick={() => press(c.key)}
                    className={cn(
                      // 34px tall, as designed; under the 44px tap minimum, which the
                      // design system lists as an open item (section 10).
                      'min-h-[34px] w-full p-0 text-cis-xs font-bold',
                      align[c.align],
                      active ? 'text-cis-orange-text' : 'text-cis-ink-muted',
                    )}
                  >
                    {c.label}
                    {active ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => {
          const leader = started && row.rank === 1;
          const yours = yourTeamIds.includes(row.teamId);
          return (
            <tr key={row.teamId} className={cn('border-b border-cis-rule', leader && 'bg-cis-ember-tint')}>
              <td
                className={cn(
                  'py-[9px] text-center font-cis-display text-cis-md font-normal',
                  leader ? 'text-cis-ember' : 'text-cis-ink-muted',
                )}
              >
                {started ? row.rank : '–'}
              </td>
              <td className="py-[9px] pl-1.5 text-left align-middle text-cis-md font-extrabold">
                <span className="block truncate">{row.name}</span>
                {yours ? (
                  <Chip variant="tint" size="s" className="mt-[3px]">
                    Your team
                  </Chip>
                ) : null}
              </td>
              <td className="py-[9px] text-center text-cis-base font-extrabold text-cis-ink-muted">{row.played}</td>
              <td className="py-[9px] text-center text-cis-base font-extrabold">{record(row)}</td>
              <td className="py-[9px] text-right text-cis-base font-extrabold">{signed(row.difference)}</td>
              <td className="py-[9px] text-right text-cis-base font-extrabold">{row.scored}</td>
              <td className="py-[9px] text-right text-cis-base font-extrabold">{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
