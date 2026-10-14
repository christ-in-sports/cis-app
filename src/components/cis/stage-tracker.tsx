/**
 * `StageTracker`, from the Sports components (`DESIGN_SYSTEM.md` §7): the life of
 * a block as boxes joined by a rule. Done is ink with a tick, now is orange with
 * its number, later is outlined and dashed. Each box also carries a word (Done /
 * Now / Later), so the state never rests on colour or shape alone, and there is
 * never a dot.
 */

import { Icon } from '@/components/cis/icon';
import type { Step } from '@/lib/competition/manage';
import { cn } from '@/lib/utils';

const WORD = { done: 'Done', now: 'Now', later: 'Later' } as const;

export function StageTracker({ steps, completedOn }: { steps: readonly Step[]; completedOn?: string | null }) {
  return (
    <ol className="m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }} aria-label="Block progress">
      {steps.map((step, i) => {
        const first = i === 0;
        const last = i === steps.length - 1;
        const word = step.key === 'completed' && step.state === 'done' && completedOn ? completedOn : WORD[step.state];
        return (
          <li key={step.key} className="flex flex-col items-center gap-1.5" aria-current={step.state === 'now' ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <span className={cn('h-0 flex-1 border-t-[3px]', first ? 'invisible' : step.state === 'later' ? 'border-dashed border-[#C9B49A]' : 'border-solid border-cis-ink-dark')} />
              <span
                className={cn(
                  'box-border flex size-9 shrink-0 items-center justify-center rounded-cis-box border-[3px] text-cis-base font-extrabold',
                  step.state === 'done' && 'border-cis-ink bg-cis-ink text-cis-paper-light',
                  step.state === 'now' && 'border-cis-ink bg-cis-orange text-cis-ink-dark',
                  step.state === 'later' && 'border-cis-ink-muted text-cis-ink-muted',
                )}
              >
                {step.state === 'done' ? <Icon name="check" size={20} strokeWidth={3.4} /> : i + 1}
              </span>
              <span className={cn('h-0 flex-1 border-t-[3px]', last ? 'invisible' : steps[i + 1].state === 'later' ? 'border-dashed border-[#C9B49A]' : 'border-solid border-cis-ink-dark')} />
            </div>
            <div className={cn('text-center text-cis-sm leading-[1.2]', step.state === 'now' ? 'font-extrabold text-cis-ink' : 'font-bold text-cis-ink-muted')}>
              {step.label}
            </div>
            <div className="text-[11px] font-bold text-cis-ink-muted">{word}</div>
          </li>
        );
      })}
    </ol>
  );
}
