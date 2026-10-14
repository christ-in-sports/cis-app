/**
 * The small Sports pieces: chips, tabs, filter chips, the nav, the schedule table
 * and the bracket. Layout is left to the browser; what is checked is what each one
 * says and which control is marked current.
 */

import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import type { BracketSection, GameView } from '@/lib/competition/view';

import { BlockSwitcher } from './block-switcher';
import { BracketSectionView, RoundJumpChips } from './bracket';
import { Chip } from './chip';
import { DivisionTabs } from './division-tabs';
import { ScheduleTable } from './schedule-table';
import { SportsNav } from './sports-nav';
import { GameStateChip } from './team-lines';

let pathname = '/sports';
let search = '';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

describe('Chip', () => {
  it('renders its label in each variant', () => {
    render(
      <>
        <Chip variant="sport">Final</Chip>
        <Chip variant="active">Next up</Chip>
        <Chip variant="outline">Upcoming</Chip>
        <Chip variant="dashed">Waiting</Chip>
        <Chip>League</Chip>
      </>,
    );
    for (const text of ['Final', 'Next up', 'Upcoming', 'Waiting', 'League']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText('Final')).toHaveClass('bg-cis-ember');
    expect(screen.getByText('Waiting')).toHaveClass('border-dashed');
    // Only buttons are pills; a chip never is (design system section 3).
    expect(screen.getByText('Final')).not.toHaveClass('rounded-cis-pill');
  });

  it('says the state of a game in a word, never a dot', () => {
    render(
      <>
        <GameStateChip state="final" />
        <GameStateChip state="next" />
        <GameStateChip state="upcoming" />
        <GameStateChip state="waiting" />
      </>,
    );
    expect(screen.getAllByText(/^(Final|Next up|Upcoming|Waiting)$/)).toHaveLength(4);
  });
});

describe('DivisionTabs', () => {
  it('links to each division and marks the current one', () => {
    render(<DivisionTabs value="ambassadors" hrefFor={(d) => `/sports?division=${d}`} />);
    const nav = screen.getByRole('navigation', { name: 'Division' });
    const juniors = within(nav).getByRole('link', { name: /Juniors/ });
    const ambassadors = within(nav).getByRole('link', { name: /Ambassadors/ });
    expect(juniors).toHaveAttribute('href', '/sports?division=juniors');
    expect(ambassadors).toHaveAttribute('aria-current', 'page');
    expect(juniors).not.toHaveAttribute('aria-current');
    expect(within(nav).getByText('Ages 10–13')).toBeInTheDocument();
    expect(within(nav).getByText('Ages 14–18')).toBeInTheDocument();
  });
});

describe('BlockSwitcher', () => {
  it('marks the selected chip current, and ticks a switched-on filter', () => {
    render(
      <BlockSwitcher
        label="Filter the schedule"
        items={[
          { key: 'all', label: 'All blocks', href: '/a', selected: true },
          { key: 'soccer', label: 'Soccer', href: '/b', selected: false },
          { key: 'mine', label: 'Falcons only', href: '/c', selected: true, tick: true },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Filter the schedule' });
    expect(within(nav).getByRole('link', { name: 'All blocks' })).toHaveAttribute('aria-current', 'true');
    expect(within(nav).getByRole('link', { name: 'Soccer' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Falcons only' }).querySelector('svg')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'All blocks' }).querySelector('svg')).not.toBeInTheDocument();
  });
});

describe('SportsNav', () => {
  it('offers Home, Standings, Schedule and Bracket, with Manage only for those who can', () => {
    pathname = '/sports';
    const { rerender } = render(<SportsNav canManage={false} />);
    expect(within(screen.getByRole('navigation', { name: 'Sports' })).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Home',
      'Standings',
      'Schedule',
      'Bracket',
    ]);
    rerender(<SportsNav canManage />);
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/sports/manage');
  });

  it.each([
    ['/sports', 'Standings'],
    ['/sports/places', 'Standings'],
    ['/sports/schedule', 'Schedule'],
    ['/sports/bracket', 'Bracket'],
  ])('lights the right item on %s', (path, label) => {
    pathname = path;
    render(<SportsNav canManage={false} />);
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.textContent)).toEqual([label]);
  });

  it('carries the division and sport onto every section link, but not Home', () => {
    pathname = '/sports/schedule';
    search = 'division=ambassadors&block=b-1&mine=1';
    render(<SportsNav canManage />);
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Standings')).toBe('/sports?division=ambassadors&block=b-1');
    expect(href('Schedule')).toBe('/sports/schedule?division=ambassadors&block=b-1');
    expect(href('Bracket')).toBe('/sports/bracket?division=ambassadors&block=b-1');
    expect(href('Manage')).toBe('/sports/manage?division=ambassadors&block=b-1');
    expect(href('Home')).toBe('/');
    search = '';
  });

  it('points Home back at the app and never lights it', () => {
    pathname = '/sports/schedule';
    render(<SportsNav canManage={false} />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
});

const line = (name: string, score: number | null, tone: 'win' | 'loss' | 'neutral' | 'waiting') => ({ name, score, tone });
const view = (over: Partial<GameView> = {}): GameView => ({
  id: 'g',
  label: 'Round 1',
  state: 'upcoming',
  home: line('Lions', null, 'neutral'),
  away: line('Rams', null, 'neutral'),
  tiebreakNote: null,
  draw: false,
  result: undefined,
  ...over,
});

describe('ScheduleTable', () => {
  it('shares one time cell between the games in a slot, and shows scores, chips and meta', () => {
    render(
      <ScheduleTable
        caption="Games on Saturday, Oct 17"
        slots={[
          {
            time: '09:00:00',
            games: [
              {
                id: 'a',
                court: 1,
                meta: 'Soccer · Round 1',
                view: view({ state: 'final', home: line('Lions', 3, 'win'), away: line('Rams', 0, 'loss') }),
              },
              { id: 'b', court: 2, meta: 'Soccer · Round 1', view: view({ home: line('Hawks', null, 'neutral'), away: line('Comets', null, 'neutral') }) },
            ],
          },
          {
            time: '09:45:00',
            games: [
              {
                id: 'c',
                court: 1,
                meta: 'Soccer · Semi-final 1',
                view: view({ state: 'waiting', home: line('Winner of Quarter-final 1', null, 'waiting'), away: line('Winner of Quarter-final 2', null, 'waiting') }),
              },
            ],
          },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Games on Saturday, Oct 17' });
    expect(within(table).getAllByText('9:00')).toHaveLength(1); // one time cell for two courts
    expect(within(table).getByText('9:45')).toBeInTheDocument();
    expect(within(table).getByText('Final')).toBeInTheDocument();
    expect(within(table).getByText('Upcoming')).toBeInTheDocument();
    expect(within(table).getByText('Waiting')).toBeInTheDocument();
    expect(within(table).getByText('Winner of Quarter-final 1')).toBeInTheDocument();
    expect(within(table).getAllByText('Soccer · Round 1')).toHaveLength(2);
    expect(within(table).getByText('3')).toBeInTheDocument(); // the winning score
  });

  it('shows a dash for a missing court and TBD for a missing time', () => {
    render(
      <ScheduleTable
        caption="x"
        slots={[{ time: null, games: [{ id: 'a', court: null, meta: 'm', view: view() }] }]}
      />,
    );
    expect(screen.getByText('TBD')).toBeInTheDocument();
    expect(screen.getAllByText('–')).toHaveLength(1);
  });

  it('puts an action under a game only when given one', () => {
    render(
      <ScheduleTable
        caption="x"
        slots={[
          {
            time: '09:00:00',
            games: [
              { id: 'a', court: 1, meta: 'm', view: view(), action: <button type="button">Enter score</button> },
              { id: 'b', court: 2, meta: 'm', view: view() },
            ],
          },
        ]}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Enter score' })).toHaveLength(1);
  });
});

describe('the bracket', () => {
  const game = (over: Partial<GameView> & { id: string; label: string }) => ({
    ...view(over),
    when: 'Oct 19 · 9:00 · Court 1',
    exit: 'Winner plays Semi-final 1 · loser plays 5th place',
  });
  const section = (over: Partial<BracketSection> = {}): BracketSection => ({
    id: 'quarters',
    title: 'Quarter-finals',
    played: 1,
    total: 2,
    items: [
      { kind: 'bye', team: 'Saints', goesTo: 'Semi-final 1' },
      {
        kind: 'game',
        game: game({ id: 'q1', label: 'Quarter-final 1', state: 'final', home: line('Kings', 3, 'win'), away: line('Pilgrims', 1, 'loss') }),
      },
      {
        kind: 'game',
        game: game({
          id: 'q2',
          label: 'Quarter-final 2',
          state: 'final',
          home: line('Eagles', 2, 'loss'),
          away: line('Warriors', 2, 'win'),
          tiebreakNote: 'Level, Warriors won on penalties',
        }),
      },
    ],
    ...over,
  });

  it('titles a round with how many games are played', () => {
    render(<BracketSectionView section={section()} first />);
    expect(screen.getByRole('heading', { name: 'Quarter-finals' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 played')).toBeInTheDocument();
  });

  it('shows a bye as its own row, a score, and what a level game was decided by', () => {
    render(<BracketSectionView section={section()} first />);
    expect(screen.getByText('Bye')).toBeInTheDocument();
    expect(screen.getByText('Straight to Semi-final 1')).toBeInTheDocument();
    expect(screen.getByText('Saints')).toBeInTheDocument();
    expect(screen.getByText('Level, Warriors won on penalties')).toBeInTheDocument();
    expect(screen.getAllByText('Winner plays Semi-final 1 · loser plays 5th place')).toHaveLength(2);
    expect(screen.getAllByText('Oct 19 · 9:00 · Court 1')).toHaveLength(2);
  });

  it('shows no state chip on a played game, but one on a game still to come', () => {
    render(
      <BracketSectionView
        first
        section={section({
          items: [
            { kind: 'game', game: game({ id: 'a', label: 'A', state: 'final' }) },
            { kind: 'game', game: game({ id: 'b', label: 'B', state: 'waiting' }) },
          ],
        })}
      />,
    );
    expect(screen.queryByText('Final')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('gives each round an anchor that its jump chip links to', () => {
    const sections = [section(), section({ id: 'semis', title: 'Semi-finals' }), section({ id: 'final', title: 'Final and places' })];
    const { container } = render(
      <>
        <RoundJumpChips sections={sections} />
        {sections.map((s, i) => (
          <BracketSectionView key={s.id} section={s} first={i === 0} />
        ))}
      </>,
    );
    const nav = screen.getByRole('navigation', { name: 'Jump to a round' });
    for (const [label, id] of [
      ['Quarters', 'round-quarters'],
      ['Semis', 'round-semis'],
      ['Final', 'round-final'],
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', `#${id}`);
      expect(container.querySelector(`#${id}`)).toBeInTheDocument();
    }
  });
});
