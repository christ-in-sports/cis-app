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
 *  - Errors are bold ink text under the field, with `role="alert"`. No red:
 *    ember is sport and danger is for destructive actions (§4), so neither may
 *    mark a validation problem. An invalid control also gets a heavier (3px)
 *    outline, so the error is not carried by text position alone.
 *  - Labels are sentence case, weight 700, 15px. No all-caps, no label above a
 *    label (§3, §5).
 *  - A ticked box is filled orange with an ink tick -- state is a filled tick
 *    box, never a colour-only dot (§3).
 *  - `ChoiceGroup` is real radio inputs styled as 12px chips. The chip is a
 *    label, so the whole chip is the tap target, and keyboard and screen-reader
 *    behaviour come from the browser rather than being rebuilt.
 */

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** What `Field` hands its control so label, hint and error stay wired up. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-cis-orange';

const controlBase =
  'w-full min-h-12 rounded-cis-chip border-2 border-cis-ink bg-cis-paper-light px-3 ' +
  'text-cis-base text-cis-ink placeholder:text-cis-ink-muted ' +
  'aria-[invalid=true]:border-[3px] disabled:opacity-60 ' +
  focusRing;

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
        <p id={errorId} role="alert" className="m-0 text-cis-sm font-bold leading-[1.4] text-cis-ink">
          {error}
        </p>
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
                error && 'border-[3px]',
              )}
            >
              {choice.label}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="m-0 text-cis-sm font-bold leading-[1.4] text-cis-ink">
          {error}
        </p>
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
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          'relative flex min-h-cis-tap-primary cursor-pointer items-start gap-cis-3 py-cis-2',
          'active:scale-[.94]',
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
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
            // Ink, not the attendance box's `--cis-box-empty`: that tan is ~1.9:1
            // on paper-light, under the 3:1 WCAG asks of a control's boundary,
            // and this box records a legal agreement.
            checked ? 'border-cis-orange bg-cis-orange' : 'border-cis-ink',
            error && !checked && 'border-[5px]',
            'peer-focus-visible:outline peer-focus-visible:outline-2',
            'peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-cis-orange',
          )}
        >
          {checked ? '✓' : ''}
        </span>
        <span className="pt-[10px] text-cis-base font-bold leading-[1.45] text-cis-ink">{children}</span>
      </label>
      {error && (
        <p id={errorId} role="alert" className="m-0 text-cis-sm font-bold leading-[1.4] text-cis-ink">
          {error}
        </p>
      )}
    </div>
  );
}
