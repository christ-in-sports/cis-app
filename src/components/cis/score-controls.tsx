/**
 * The controls on the score entry sheet, from the Sports designs: `ScoreStepper`
 * (soccer, and the points inside a volleyball set), `QuickPoints` (basketball),
 * `SetTable` (volleyball), `RoundWinnerPicker` (dodgeball) and the `PickButton`
 * the tiebreak prompt shares with it.
 *
 * Sideline rules: every control is 56px or taller, the number being set is the
 * display face in ember (a score is the one thing ember marks), and nothing
 * depends on colour alone, since the picked name is also filled with ink.
 * `disabled` locks a whole control while a save is in flight.
 */

import { Icon } from '@/components/cis/icon';
import type { Side } from '@/lib/competition/scores';
import { cn } from '@/lib/utils';

const ROUND_BUTTON =
  'flex shrink-0 items-center justify-center rounded-cis-pill transition-none disabled:cursor-not-allowed disabled:opacity-40';

const MINUS =
  'border-[3px] border-cis-ink bg-transparent text-cis-ink hover:bg-cis-paper';
const PLUS =
  'bg-cis-orange text-cis-ink-dark shadow-cis-press hover:bg-cis-orange-hover ' +
  'active:translate-y-[3px] active:shadow-[0_1px_0_var(--cis-orange-shadow)] ' +
  'disabled:shadow-none disabled:active:translate-y-0';

/** The number being set. Ember, display face; `size` picks one of the three score tokens. */
export function ScoreNumber({
  value,
  size = 'lg',
  className,
}: {
  value: number | string;
  size?: 'lg' | 'md' | 'sm';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-cis-display font-normal tabular-nums text-cis-ember',
        size === 'lg' && 'text-cis-score',
        size === 'md' && 'text-cis-score-md',
        size === 'sm' && 'text-cis-score-sm',
        className,
      )}
    >
      {value}
    </span>
  );
}

export function ScoreStepper({
  value,
  unit,
  teamName,
  onChange,
  disabled,
  size = 'lg',
}: {
  value: number;
  /** "goal", "point": used in the buttons' accessible names. */
  unit: string;
  teamName: string;
  onChange: (delta: number) => void;
  disabled?: boolean;
  size?: 'lg' | 'md';
}) {
  const dim = size === 'lg' ? 'size-[72px]' : 'size-16';
  return (
    <div className="flex items-center justify-between gap-2.5">
      <button
        type="button"
        className={cn(ROUND_BUTTON, MINUS, dim)}
        aria-label={`One fewer ${unit} for ${teamName}`}
        disabled={disabled || value === 0}
        onClick={() => onChange(-1)}
      >
        <Icon name="minus" size={36} />
      </button>
      <ScoreNumber value={value} size={size} className="flex-1 text-center" />
      <button
        type="button"
        className={cn(ROUND_BUTTON, PLUS, dim)}
        aria-label={`One more ${unit} for ${teamName}`}
        disabled={disabled}
        onClick={() => onChange(1)}
      >
        <Icon name="plus" size={36} />
      </button>
    </div>
  );
}

/** Basketball: tap a quick button for each basket. A single −1 fixes a mis-tap. */
export function QuickPoints({
  teamName,
  onChange,
  disabled,
  canUndo,
}: {
  teamName: string;
  onChange: (delta: number) => void;
  disabled?: boolean;
  canUndo: boolean;
}) {
  const base =
    'min-h-[60px] flex-1 rounded-cis-pill text-cis-xl font-extrabold transition-none disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        className={cn(base, MINUS)}
        aria-label={`Take off one point for ${teamName}`}
        disabled={disabled || !canUndo}
        onClick={() => onChange(-1)}
      >
        −1
      </button>
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          className={cn(base, PLUS)}
          aria-label={`${n} point${n === 1 ? '' : 's'} for ${teamName}`}
          disabled={disabled}
          onClick={() => onChange(n)}
        >
          +{n}
        </button>
      ))}
    </div>
  );
}

/** A name to tap: the tiebreak winner, or the winner of a dodgeball round. */
export function PickButton({
  picked,
  onClick,
  disabled,
  children,
}: {
  picked: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-14 min-w-0 flex-1 rounded-cis-box border-2 border-cis-ink px-2 text-cis-md font-extrabold transition-none',
        'disabled:cursor-not-allowed disabled:opacity-40',
        picked ? 'bg-cis-ink text-cis-paper-light' : 'bg-transparent text-cis-ink hover:bg-cis-paper',
      )}
    >
      {children}
    </button>
  );
}

/** Dodgeball: one row per round, tap the winner. Rounds past the deciding one are "not needed". */
export function RoundWinnerPicker({
  rounds,
  needed,
  names,
  onPick,
  disabled,
}: {
  rounds: { winner: Side | null }[];
  needed: number;
  names: { home: string; away: string };
  onPick: (index: number, side: Side) => void;
  disabled?: boolean;
}) {
  const leader = (() => {
    const tally = { home: 0, away: 0 };
    for (const r of rounds.slice(0, needed)) if (r.winner) tally[r.winner]++;
    return tally.home >= tally.away ? 'home' : 'away';
  })();
  return (
    <div className="border-t-4 border-cis-ink-dark">
      {rounds.map((round, i) => {
        const isNeeded = i < needed;
        return (
          <div
            key={i}
            className="flex min-h-[70px] items-center gap-2.5 border-b border-cis-rule py-2 last:border-b-0"
          >
            <div className={cn('w-[62px] shrink-0 text-cis-base', isNeeded ? 'font-extrabold' : 'font-semibold text-cis-ink-muted')}>
              Round {i + 1}
            </div>
            {isNeeded ? (
              <>
                <PickButton picked={round.winner === 'home'} disabled={disabled} onClick={() => onPick(i, 'home')}>
                  {names.home}
                </PickButton>
                <PickButton picked={round.winner === 'away'} disabled={disabled} onClick={() => onPick(i, 'away')}>
                  {names.away}
                </PickButton>
              </>
            ) : (
              <div className="flex-1 text-cis-base font-semibold text-cis-ink-muted">
                Not needed, {names[leader]} already have {Math.floor(rounds.length / 2) + 1}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Volleyball: one row per set. Tap a row to point the steppers at it. */
export function SetTable({
  sets,
  needed,
  active,
  names,
  onSelect,
}: {
  sets: { home: number; away: number }[];
  needed: number;
  active: number;
  names: { home: string; away: string };
  onSelect: (index: number) => void;
}) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: '70px' }} />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr className="border-b-4 border-cis-ink-dark">
          <th scope="col" className="pb-2 text-left text-cis-xs font-bold text-cis-ink-muted">
            Set
          </th>
          <th scope="col" className="pb-2 pr-2 text-right text-cis-xs font-bold text-cis-ink-muted">
            {names.home}
          </th>
          <th scope="col" className="pb-2 pr-2 text-right text-cis-xs font-bold text-cis-ink-muted">
            {names.away}
          </th>
        </tr>
      </thead>
      <tbody>
        {sets.map((set, i) => {
          const isNeeded = i < needed;
          const played = set.home !== 0 || set.away !== 0;
          const isActive = i === active && isNeeded;
          const cell = (side: Side) =>
            !isNeeded || !played ? (
              <span className="font-semibold text-cis-ink-muted">–</span>
            ) : (
              <span className={cn('font-extrabold', set[side] < set[side === 'home' ? 'away' : 'home'] && 'font-semibold text-cis-ink-muted')}>
                {set[side]}
              </span>
            );
          return (
            <tr
              key={i}
              className={cn('border-b border-cis-rule', isActive && 'bg-cis-paper')}
              aria-current={isActive ? 'true' : undefined}
            >
              <th scope="row" className="p-0 text-left">
                {isNeeded ? (
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    aria-label={`Edit set ${i + 1}`}
                    className="min-h-14 w-full pl-2 text-left text-cis-base font-extrabold"
                  >
                    Set {i + 1}
                  </button>
                ) : (
                  <span className="block pl-2 text-cis-base font-semibold text-cis-ink-muted">Set {i + 1}</span>
                )}
              </th>
              <td className="pr-2 text-right text-cis-xl">{cell('home')}</td>
              <td className="pr-2 text-right text-cis-xl">{cell('away')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
