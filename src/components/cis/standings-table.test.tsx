/**
 * StandingsTable: the rank is the library's and never moves, a header sorts, and
 * the table says what it is for assistive technology.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import type { StandingsRowView } from '@/lib/competition/view';

import { StandingsTable } from './standings-table';

const row = (over: Partial<StandingsRowView> & { teamId: string; name: string; rank: number }): StandingsRowView => ({
  played: 3,
  won: 0,
  drawn: 0,
  lost: 0,
  scored: 0,
  conceded: 0,
  difference: 0,
  points: 0,
  ...over,
});

const rows = [
  row({ teamId: 'a', name: 'Lions', rank: 1, won: 3, scored: 9, conceded: 2, difference: 7, points: 9 }),
  row({ teamId: 'b', name: 'Falcons', rank: 2, won: 2, drawn: 1, scored: 6, conceded: 3, difference: 3, points: 7 }),
  row({ teamId: 'c', name: 'Eagles', rank: 3, won: 2, lost: 1, scored: 5, conceded: 4, difference: 1, points: 6 }),
  row({ teamId: 'd', name: 'Rams', rank: 4, lost: 3, scored: 1, conceded: 7, difference: -6, points: 0 }),
];

const names = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1) // the header row
    .map((r) => within(r).getAllByRole('cell')[1].textContent?.replace('Your team', '').trim());

const ranks = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

const renderTable = (over: Partial<React.ComponentProps<typeof StandingsTable>> = {}) =>
  render(<StandingsTable rows={rows} sport="soccer" started yourTeamIds={[]} caption="Juniors soccer standings" {...over} />);

describe('StandingsTable', () => {
  it('is a real table with a caption, and lists teams in rank order to begin with', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Juniors soccer standings' })).toBeInTheDocument();
    expect(names()).toEqual(['Lions', 'Falcons', 'Eagles', 'Rams']);
    expect(ranks()).toEqual(['1', '2', '3', '4']);
  });

  it('writes the record and a signed difference', () => {
    renderTable();
    const lions = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(within(lions).getByText('3–0–0')).toBeInTheDocument();
    expect(within(lions).getByText('+7')).toBeInTheDocument();
    const rams = within(screen.getByRole('table')).getAllByRole('row')[4];
    expect(within(rams).getByText('−6')).toBeInTheDocument();
  });

  it.each([
    ['soccer', 'GD', 'GF'],
    ['basketball', 'PD', 'PF'],
    ['volleyball', 'SD', 'SW'],
    ['dodgeball', 'RD', 'RW'],
  ])('names the last columns for %s', (sport, diff, scored) => {
    renderTable({ sport });
    expect(screen.getByRole('button', { name: diff })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: scored })).toBeInTheDocument();
  });

  describe('sorting', () => {
    it('starts sorted by points, high to low, and says so', () => {
      renderTable();
      const pts = screen.getByRole('columnheader', { name: /Pts/ });
      expect(pts).toHaveAttribute('aria-sort', 'descending');
    });

    it('sorts by name, A to Z first, then Z to A', () => {
      renderTable();
      fireEvent.click(screen.getByRole('button', { name: 'Team' }));
      expect(names()).toEqual(['Eagles', 'Falcons', 'Lions', 'Rams']);
      expect(screen.getByRole('columnheader', { name: /Team/ })).toHaveAttribute('aria-sort', 'ascending');

      fireEvent.click(screen.getByRole('button', { name: /Team/ }));
      expect(names()).toEqual(['Rams', 'Lions', 'Falcons', 'Eagles']);
      expect(screen.getByRole('columnheader', { name: /Team/ })).toHaveAttribute('aria-sort', 'descending');
    });

    it('never changes a rank, however it is sorted', () => {
      renderTable();
      fireEvent.click(screen.getByRole('button', { name: 'Team' }));
      // Eagles, Falcons, Lions, Rams keep the ranks they had: 3, 2, 1, 4.
      expect(ranks()).toEqual(['3', '2', '1', '4']);
    });

    it('sorts a number column high to low first', () => {
      renderTable();
      fireEvent.click(screen.getByRole('button', { name: 'GD' }));
      expect(names()).toEqual(['Lions', 'Falcons', 'Eagles', 'Rams']);
      fireEvent.click(screen.getByRole('button', { name: /GD/ }));
      expect(names()).toEqual(['Rams', 'Eagles', 'Falcons', 'Lions']);
    });
  });

  describe('the leader and your team', () => {
    it('washes the leader row only', () => {
      renderTable();
      const dataRows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      expect(dataRows[0]).toHaveClass('bg-cis-ember-tint');
      expect(dataRows[1]).not.toHaveClass('bg-cis-ember-tint');
    });

    it('keeps the wash on the leader when sorted away from the top', () => {
      renderTable();
      fireEvent.click(screen.getByRole('button', { name: 'Team' }));
      const lions = within(screen.getByRole('table')).getByText('Lions').closest('tr')!;
      expect(lions).toHaveClass('bg-cis-ember-tint');
    });

    it('flags your team with a chip, and only that team', () => {
      renderTable({ yourTeamIds: ['b'] });
      expect(screen.getAllByText('Your team')).toHaveLength(1);
      expect(within(screen.getByText('Falcons').closest('td')!).getByText('Your team')).toBeInTheDocument();
    });

    it('can flag several teams', () => {
      renderTable({ yourTeamIds: ['a', 'd'] });
      expect(screen.getAllByText('Your team')).toHaveLength(2);
    });
  });

  describe('before a game is played', () => {
    it('shows a dash for every rank, no wash, and plain headers with nothing to sort', () => {
      renderTable({ started: false });
      expect(ranks()).toEqual(['–', '–', '–', '–']);
      const dataRows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      expect(dataRows.some((r) => r.className.includes('bg-cis-ember-tint'))).toBe(false);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Team' })).toBeInTheDocument();
    });
  });
});
