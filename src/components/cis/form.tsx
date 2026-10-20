/**
 * Form controls for CIS screens: `Field`, `TextInput`, `SelectInput`,
 * `ChoiceGroup` and `TickRow`.
 *
 * `DESIGN_SYSTEM.md` has no form section, so these are built from its rules
 * rather than from a prototype -- see the "Forms" entry in §7. What they take
 * from it:
 *
 *  - Controls are 48px tall (>= the 44px tap minimum), 12px radius (the chip
 *    step -- no new radius), and sit on paper-light with a 2px ink outline, the
 *    same treatment as the roster's search box.
 *  - Focus is the system-wide 2px orange outline at a 3px offset (§6), never
 *    the browser default.
 *  - Errors are bold danger-red text with a warning icon under the field
 *    (`FieldError`), with `role="alert"`, and the invalid control gets a
 *    heavier danger outline, so the error is not carried by colour alone. This
 *    is the Sports screens' treatment (see `score-form.tsx`): ember stays
 *    "this is a score", so it never marks an error.
 *  - Labels are sentence case, weight 700, 15px. No all-caps, no label above a
 *    label (§3, §5).
 *  - A ticked box is filled orange with an ink tick -- state is a filled tick
 *    box, never a colour-only dot (§3).
 *  - `ChoiceGroup` is real radio inputs styled as 12px chips. The chip is a
 *    label, so the whole chip is the tap target, and keyboard and screen-reader
 *    behaviour come from the browser rather than being rebuilt.
 */

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Icon } from '@/components/cis/icon';
import { cn } from '@/lib/utils';

/** What `Field` hands its control so label, hint and error stay wired up. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-cis-orange';

/**
 * iOS Safari sizes a date or time input from its own intrinsic width and ignores
 * `w-full`, so it pokes out of the sheet it sits in. Dropping the native look and
 * letting it shrink (`min-w-0`, `max-w-full`) keeps it inside its column; the
 * value is left-aligned because `appearance: none` would otherwise centre it.
 * Exported for the few shadcn inputs that are also dates.
 */
export const dateTimeFix =
  '[&:is([type=date],[type=time])]:min-w-0 [&:is([type=date],[type=time])]:max-w-full ' +
  '[&:is([type=date],[type=time])]:appearance-none [&::-webkit-date-and-time-value]:text-left';

const controlBase =
  'w-full min-w-0 max-w-full min-h-12 rounded-cis-chip border-2 border-cis-ink bg-cis-paper-light px-3 ' +
  dateTimeFix + ' ' +
  'text-cis-base text-cis-ink placeholder:text-cis-ink-muted ' +
  'aria-[invalid=true]:border-[3px] aria-[invalid=true]:border-cis-danger disabled:opacity-60 ' +
  focusRing;

/**
 * A validation message: danger red, bold, with a warning icon and
 * `role="alert"` so a screen reader announces it.
 *
 * The same treatment as the Sports score form (`score-form.tsx`), so an error
 * looks the same wherever it appears. `--cis-danger` is otherwise for
 * destructive actions (`DESIGN_SYSTEM.md` §4); errors are the one other place it
 * is used, and ember is kept out of it so ember always means "this is a score".
 * Danger on 13px bold text is 8.7:1 on paper-light, well over the 4.5:1 AA floor.
 * The icon and the text carry the meaning, not the hue alone.
 */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="m-0 flex items-start gap-1.5 text-cis-sm font-bold leading-[1.4] text-cis-danger"
    >
      <Icon name="warning" size={16} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  /** The first message for this field, if it has one. */
  error?: string;
  /** Marks the field as not required. Required is the default and is unmarked. */
  optional?: boolean;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-cis-base font-bold leading-[1.3] text-cis-ink">
        {label}
        {optional && <span className="font-semibold text-cis-ink-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="m-0 text-cis-sm font-semibold leading-[1.4] text-cis-ink-muted">
          {hint}
        </p>
      )}
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {error && (
        <FieldError id={errorId}>{error}</FieldError>
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, 'h-12', className)} {...props} />;
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlBase, 'h-12 font-bold', className)} {...props} />;
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/**
 * A short list of mutually exclusive choices, laid out as chips. Use it where
 * every option should be visible at once (gender, T-shirt size, division);
 * use `SelectInput` when the list is long.
 */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  hint,
  error,
  choices,
  value,
  onChange,
  disabled,
}: {
  name: string;
  legend: string;
  hint?: string;
  error?: string;
  choices: ReadonlyArray<Choice<T>>;
  value: T | '';
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0"
      aria-describedby={describedBy || undefined}
      data-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className="mb-1 p-0 text-cis-base font-bold leading-[1.3] text-cis-ink">{legend}</legend>
      {hint && (
        <p id={hintId} className="m-0 text-cis-sm font-semibold leading-[1.4] text-cis-ink-muted">
          {hint}
        </p>
      )}
      <div className="flex flex-wrap gap-cis-2">
        {choices.map((choice) => (
          <label key={choice.value} className="relative">
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-cis-tap-min min-w-cis-tap-min cursor-pointer items-center justify-center',
                'rounded-cis-chip border-2 border-cis-ink bg-cis-paper-light px-3',
                'text-cis-base font-bold text-cis-ink',
                'peer-checked:bg-cis-ink peer-checked:text-cis-paper-light',
                'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
                'peer-focus-visible:outline peer-focus-visible:outline-2',
                'peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-cis-orange',
                'active:scale-[.94]',
                error && 'border-[3px] border-cis-danger',
              )}
            >
              {choice.label}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <FieldError id={errorId}>{error}</FieldError>
      )}
    </fieldset>
  );
}

/**
 * A checkbox row where the whole row is the tap target -- the attendance row's
 * behaviour (§7), so a phone thumb does not have to find a 20px square. The box
 * is the 14px-radius tick box, filled orange with an ink tick when set.
 */
export function TickRow({
  checked,
  onChange,
  error,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  /** Not changeable right now (still shown, so its state can be read). */
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          'group relative flex min-h-cis-tap-primary items-start gap-cis-3 py-cis-2',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'flex h-cis-tap-min w-cis-tap-min shrink-0 items-center justify-center rounded-cis-box',
            'border-[3px] bg-cis-paper-light text-cis-lg font-extrabold text-cis-ink-dark',
            // The press feedback shrinks the drawn box, not the row. Scaling the
            // whole label shrinks its hit area while a finger is down, and a tap
            // that lands near an edge then ends outside it and never becomes a
            // click: the box visibly "moves" and nothing is ticked.
            !disabled && 'group-active:scale-[.94]',
            // Ink, not the attendance box's `--cis-box-empty`: that tan is ~1.9:1
            // on paper-light, under the 3:1 WCAG asks of a control's boundary,
            // and this box records a legal agreement.
            checked ? 'border-cis-orange bg-cis-orange' : 'border-cis-ink',
            error && !checked && 'border-cis-danger',
            'peer-focus-visible:outline peer-focus-visible:outline-2',
            'peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-cis-orange',
          )}
        >
          {checked ? '✓' : ''}
        </span>
        <span className="pt-[10px] text-cis-base font-bold leading-[1.45] text-cis-ink">{children}</span>
      </label>
      {error && (
        <FieldError id={errorId}>{error}</FieldError>
      )}
    </div>
  );
}
