import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { Input } from '@/components/ui/input';

import { Field, TextInput, TickRow } from './form';

describe('date and time inputs', () => {
  // iOS Safari sizes these from their own intrinsic width and ignores w-full, so they
  // poked out of the sheet they sat in. The fix is class-based, so what is checked is
  // that every date input carries it.
  const fix = ['min-w-0', 'max-w-full', 'appearance-none', 'text-left'];
  const has = (el: HTMLElement) => fix.every((part) => el.className.includes(part));

  it('are told to shrink to their column, in the shared TextInput', () => {
    render(
      <Field label="Start date">{(p) => <TextInput {...p} type="date" />}</Field>
    );
    expect(has(screen.getByLabelText('Start date'))).toBe(true);
  });

  it('are told the same in the shadcn Input some screens still use', () => {
    render(<Input aria-label="Date of birth" type="date" />);
    expect(has(screen.getByLabelText('Date of birth'))).toBe(true);
  });
});

describe('TickRow', () => {
  // Pressing a row used to scale the whole label. That shrinks its hit area while a
  // finger is down, so a tap near an edge ended outside it and never became a click:
  // the box moved and nothing was ticked. The feedback belongs on the drawn box.
  it('keeps the tappable row the same size while pressed', () => {
    render(
      <TickRow checked={false} onChange={() => {}}>
        Coach
      </TickRow>
    );

    const row = screen.getByRole('checkbox').closest('label')!;
    expect(row.className).not.toMatch(/active:scale/);
    expect(row.querySelector('[class*="group-active:scale"]')).not.toBeNull();
  });

  it('does not react to a press, or take a click, when disabled', () => {
    const onChange = jest.fn();
    render(
      <TickRow checked onChange={onChange} disabled>
        Admin
      </TickRow>
    );

    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('checkbox').closest('label')!.querySelector('[class*="group-active:scale"]')).toBeNull();
  });
});
