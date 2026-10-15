import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { stageTrack } from '@/lib/competition/manage';

import { StageTracker } from './stage-tracker';

describe('StageTracker', () => {
  it('names every step with a word for its state, and marks the current one', () => {
    render(<StageTracker steps={stageTrack({ format: 'league_knockout', status: 'league' })} />);
    const items = within(screen.getByRole('list', { name: 'Block progress' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['✓SetupDone', '2LeagueNow', '3KnockoutLater', '4CompletedLater'].map((t) => expect.stringContaining(t.replace('✓', ''))));
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });

  it('shows the completion date in the last box', () => {
    render(<StageTracker steps={stageTrack({ format: 'league', status: 'completed' })} completedOn="Oct 26" />);
    expect(screen.getByText('Oct 26')).toBeInTheDocument();
  });
});
