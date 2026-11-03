import { render, screen } from '@testing-library/react';

import { MenuRow, MenuSheet } from './menu-list';

describe('MenuRow', () => {
  it('colours its icon tile by domain: orange for the game, slate for people', () => {
    const { container } = render(
      <MenuSheet heading="Run the day">
        <MenuRow href="/sports/schedule" title="Games and scores" icon="schedule" domain="sport" />
        <MenuRow href="/teams" title="Teams" icon="roster" />
      </MenuSheet>,
    );
    const [sport, people] = container.querySelectorAll('[data-domain]');
    expect(sport).toHaveAttribute('data-domain', 'sport');
    expect(sport).toHaveClass('bg-cis-sport-tint', 'text-cis-sport-text');
    expect(people).toHaveAttribute('data-domain', 'people');
    expect(people).toHaveClass('bg-cis-chrome-tab', 'text-cis-action');
    // The whole row is the link; the tile adds nothing to its name.
    expect(screen.getByRole('link', { name: 'Games and scores' })).toHaveAttribute('href', '/sports/schedule');
  });

  it('shows no tile when a row has no icon', () => {
    const { container } = render(
      <MenuSheet heading="Season">
        <MenuRow href="/sports" title="Standings" />
      </MenuSheet>,
    );
    expect(container.querySelector('[data-domain]')).toBeNull();
  });
});
