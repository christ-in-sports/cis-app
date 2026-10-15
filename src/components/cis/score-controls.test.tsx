/**
 * The score entry controls: what each says, which are locked, and that a score
 * stays ember whatever size it is set in (the class merger once dropped the
 * colour when a size token was not registered with it).
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { PickButton, ScoreInput, QuickPoints, RoundWinnerPicker, ScoreNumber, ScoreStepper, SetTable } from './score-controls';

describe('ScoreNumber', () => {
  it.each(['lg', 'md', 'sm'] as const)('is ember at size %s', (size) => {
    render(<ScoreNumber value={7} size={size} />);
    expect(screen.getByText('7')).toHaveClass('text-cis-ember');
  });
});

describe('ScoreStepper', () => {
  it('reports one up or one down, and names the team in each button', () => {
    const onChange = jest.fn();
    render(<ScoreStepper value={2} unit="goal" teamName="Falcons" onChange={onChange} onSet={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'One more goal for Falcons' }));
    fireEvent.click(screen.getByRole('button', { name: 'One fewer goal for Falcons' }));
    expect(onChange.mock.calls).toEqual([[1], [-1]]);
  });

  it('cannot go below zero, and locks while saving', () => {
    const { rerender } = render(<ScoreStepper value={0} unit="goal" teamName="Falcons" onChange={() => {}} onSet={() => {}} />);
    expect(screen.getByRole('button', { name: 'One fewer goal for Falcons' })).toBeDisabled();
    rerender(<ScoreStepper value={3} unit="goal" teamName="Falcons" onChange={() => {}} onSet={() => {}} disabled />);
    expect(screen.getByRole('button', { name: 'One more goal for Falcons' })).toBeDisabled();
  });
});

describe('ScoreInput', () => {
  it('takes a typed score, keeping only digits and at most three', () => {
    const onSet = jest.fn();
    render(<ScoreInput value={0} label="Points for Saints" onSet={onSet} />);
    const input = screen.getByRole('textbox', { name: 'Points for Saints' });
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.change(input, { target: { value: '2a5b' } });
    fireEvent.change(input, { target: { value: '12345' } });
    expect(onSet.mock.calls).toEqual([[25], [25], [123]]);
  });

  it('clearing the field is a zero, and the number pad is asked for', () => {
    const onSet = jest.fn();
    render(<ScoreInput value={7} label="Goals" onSet={onSet} />);
    const input = screen.getByRole('textbox', { name: 'Goals' });
    fireEvent.change(input, { target: { value: '' } });
    expect(onSet).toHaveBeenCalledWith(0);
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('is ember at every size, like the numbers it replaces', () => {
    render(<ScoreInput value={3} label="Goals" onSet={() => {}} size="md" />);
    expect(screen.getByRole('textbox')).toHaveClass('text-cis-ember');
  });

  it('is typeable from a stepper too', () => {
    const onSet = jest.fn();
    render(<ScoreStepper value={0} unit="goal" teamName="Falcons" onChange={() => {}} onSet={onSet} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Goals for Falcons' }), { target: { value: '4' } });
    expect(onSet).toHaveBeenCalledWith(4);
  });
});

describe('QuickPoints', () => {
  it('offers +1, +2 and +3, and a −1 only when there is something to take off', () => {
    const onChange = jest.fn();
    const { rerender } = render(<QuickPoints teamName="Eagles" canUndo={false} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Take off one point for Eagles' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '3 points for Eagles' }));
    expect(onChange).toHaveBeenCalledWith(3);
    rerender(<QuickPoints teamName="Eagles" canUndo onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Take off one point for Eagles' })).toBeEnabled();
  });
});

describe('PickButton', () => {
  it('says whether it is picked to assistive tech, not only by colour', () => {
    render(
      <>
        <PickButton picked onClick={() => {}}>Rams</PickButton>
        <PickButton picked={false} onClick={() => {}}>Anchors</PickButton>
      </>
    );
    expect(screen.getByRole('button', { name: 'Rams' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Anchors' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('RoundWinnerPicker', () => {
  const names = { home: 'Rams', away: 'Anchors' };

  it('reports which round and which side was tapped', () => {
    const onPick = jest.fn();
    render(
      <RoundWinnerPicker
        rounds={[{ winner: null }, { winner: null }, { winner: null }]}
        needed={3}
        names={names}
        onPick={onPick}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Anchors' })[1]);
    expect(onPick).toHaveBeenCalledWith(1, 'away');
  });

  it('marks rounds past the deciding one as not needed, with no buttons', () => {
    render(
      <RoundWinnerPicker
        rounds={[{ winner: 'home' }, { winner: 'home' }, { winner: 'home' }, { winner: null }, { winner: null }]}
        needed={3}
        names={names}
        onPick={() => {}}
      />
    );
    expect(screen.getAllByText('Not needed, Rams already have 3')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Rams' })).toHaveLength(3);
  });
});

describe('SetTable', () => {
  const names = { home: 'Saints', away: 'Kings' };
  const sets = [
    { home: 25, away: 21 },
    { home: 18, away: 25 },
    { home: 15, away: 12 },
    { home: 0, away: 0 },
    { home: 0, away: 0 },
  ];

  it('is a table with the active set marked and unplayed sets as dashes', () => {
    render(<SetTable sets={sets} needed={3} active={2} names={names} onSelect={() => {}} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(within(table).getAllByRole('row')[3]).toHaveAttribute('aria-current', 'true');
    expect(within(table).getAllByText('–').length).toBe(4);
  });

  it('selects a needed set and leaves later ones inert', () => {
    const onSelect = jest.fn();
    render(<SetTable sets={sets} needed={3} active={2} names={names} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit set 1' }));
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('button', { name: 'Edit set 4' })).not.toBeInTheDocument();
  });
});
