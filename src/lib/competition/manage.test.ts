import {
  capacityText,
  countGames,
  fixturePreview,
  gameDays,
  groupSizes,
  lockedNote,
  manageActions,
  nextStep,
  roundRobinGames,
  stageTrack,
} from './manage';
import type { BlockRecord, GameRecord } from './types';

type B = Pick<BlockRecord, 'format' | 'status' | 'division' | 'league_structure'>;
const block = (over: Partial<B> = {}): B => ({
  format: 'league_knockout',
  status: 'setup',
  division: 'juniors',
  league_structure: 'round_robin',
  ...over,
});

function game(over: Partial<GameRecord> = {}): GameRecord {
  return {
    id: Math.random().toString(36).slice(2),
    sport_block_id: 'b1',
    home_team_id: 'a',
    away_team_id: 'b',
    stage: 'league',
    group_label: null,
    round: 1,
    label: 'Round 1',
    scheduled_date: null,
    scheduled_time: null,
    court: null,
    status: 'scheduled',
    winner_to_game_id: null,
    winner_to_slot: null,
    loser_to_game_id: null,
    loser_to_slot: null,
    winner_place: null,
    loser_place: null,
    ...over,
  };
}
const many = (n: number, over: Partial<GameRecord> = {}) => Array.from({ length: n }, () => game(over));

describe('stageTrack', () => {
  it('walks a league then knockout block through four steps', () => {
    const states = (status: B['status']) => stageTrack(block({ status })).map((s) => s.state);
    expect(states('setup')).toEqual(['now', 'later', 'later', 'later']);
    expect(states('league')).toEqual(['done', 'now', 'later', 'later']);
    expect(states('knockout')).toEqual(['done', 'done', 'now', 'later']);
    expect(states('completed')).toEqual(['done', 'done', 'done', 'done']);
  });

  it('leaves out the stage a format does not have', () => {
    expect(stageTrack(block({ format: 'league' })).map((s) => s.key)).toEqual(['setup', 'league', 'completed']);
    expect(stageTrack(block({ format: 'knockout' })).map((s) => s.key)).toEqual(['setup', 'knockout', 'completed']);
  });
});

describe('counts and previews', () => {
  it('counts games, times and results', () => {
    const games = [game({ status: 'completed', scheduled_date: '2026-10-17' }), game({ scheduled_date: '2026-10-17' }), game()];
    expect(countGames(games)).toMatchObject({ games: 3, scheduled: 2, played: 1, unplayed: 2, unscheduled: 1 });
  });

  it('works out round-robin sizes', () => {
    expect(roundRobinGames(8)).toBe(28);
    expect(roundRobinGames(6)).toBe(15);
    expect(groupSizes(7)).toEqual([4, 3]);
    expect(groupSizes(8)).toEqual([4, 4]);
  });

  it('previews the fixtures a setup will make', () => {
    expect(fixturePreview(block(), 8)).toBe('8 teams in one table makes 28 games. Each team plays 7.');
    expect(fixturePreview(block({ league_structure: 'groups' }), 8)).toBe('8 teams in two groups (4 and 4) makes 12 games.');
    expect(fixturePreview(block({ format: 'knockout' }), 6)).toMatch(/seeded bracket/);
  });

  it('describes a game day before it is made', () => {
    expect(capacityText(3, 2, 9)).toBe('3 slots × 2 courts = 6 games. 9 games have no time yet.');
    expect(capacityText(1, 1, 1)).toBe('1 slot × 1 court = 1 game. 1 game has no time yet.');
  });

  it('lists game days earliest first with how many are played', () => {
    const games = [
      game({ scheduled_date: '2026-10-19', status: 'completed' }),
      game({ scheduled_date: '2026-10-12' }),
      game({ scheduled_date: '2026-10-19' }),
      game(),
    ];
    expect(gameDays(games)).toEqual([
      { date: '2026-10-12', games: 1, played: 0 },
      { date: '2026-10-19', games: 2, played: 1 },
    ]);
  });

  it('only mentions locked fields once there are games', () => {
    expect(lockedNote(0)).toBeNull();
    expect(lockedNote(28)).toMatch(/locked because this block has 28 games/);
  });
});

describe('manageActions', () => {
  it('needs six teams to generate fixtures, and says how many it has', () => {
    const short = manageActions(block(), 4, []);
    expect(short.generate).toMatchObject({ shown: true, enabled: false, why: 'Needs at least 6 teams. This division has 4.' });
    expect(manageActions(block(), 8, []).generate.enabled).toBe(true);
    expect(manageActions(block(), 9, []).generate.enabled).toBe(false);
  });

  it('calls the knockout-only action a bracket', () => {
    expect(manageActions(block({ format: 'knockout' }), 8, []).generate.label).toBe('Generate bracket');
  });

  it('offers nothing but setup actions before games exist', () => {
    const a = manageActions(block(), 8, []);
    expect([a.schedule.shown, a.clear.shown, a.knockout.shown, a.complete.shown, a.reset.shown]).toEqual([false, false, false, false, false]);
  });

  it('locks the knockout until every league game has a result', () => {
    const games = [...many(25, { status: 'completed' }), ...many(3)];
    const a = manageActions(block({ status: 'league' }), 8, games);
    expect(a.knockout).toMatchObject({ enabled: false, why: '3 league games still need a result.' });
    const ready = manageActions(block({ status: 'league' }), 8, many(28, { status: 'completed' }));
    expect(ready.knockout.enabled).toBe(true);
  });

  it('has nothing to schedule once every unplayed game has a time', () => {
    const games = [game({ scheduled_date: '2026-10-17' }), game({ status: 'completed' })];
    expect(manageActions(block({ status: 'league' }), 8, games).schedule).toMatchObject({ enabled: false });
    expect(manageActions(block({ status: 'league' }), 8, [game()]).schedule.enabled).toBe(true);
  });

  it('can clear only when an unplayed game is on a day', () => {
    expect(manageActions(block({ status: 'league' }), 8, [game()]).clear).toMatchObject({ enabled: false, why: 'No game days to clear yet.' });
    expect(manageActions(block({ status: 'league' }), 8, [game({ scheduled_date: '2026-10-17' })]).clear.enabled).toBe(true);
  });

  it('completes only from the last stage, once everything has a result', () => {
    const open = [...many(6, { status: 'completed', stage: 'knockout' }), ...many(3, { stage: 'knockout' })];
    const a = manageActions(block({ status: 'knockout' }), 8, open);
    expect(a.complete).toMatchObject({ enabled: false, why: '3 games still need a result, and 3 still need a time.' });
    expect(manageActions(block({ status: 'knockout' }), 8, many(9, { status: 'completed' })).complete.enabled).toBe(true);
    // A league stage of a league-then-knockout block is not the last stage.
    expect(manageActions(block({ status: 'league' }), 8, many(9, { status: 'completed' })).complete.shown).toBe(false);
    expect(manageActions(block({ format: 'league', status: 'league' }), 8, many(9, { status: 'completed' })).complete.enabled).toBe(true);
  });

  it('a completed block can only be reset', () => {
    const a = manageActions(block({ status: 'completed' }), 8, many(5, { status: 'completed' }));
    expect(a.schedule.enabled).toBe(false);
    expect(a.clear.shown).toBe(false);
    expect(a.reset.enabled).toBe(true);
  });
});

describe('nextStep', () => {
  const step = (b: B, teams: number, games: GameRecord[]) => nextStep(b, teams, games, 'Ambassadors');

  it('asks for teams, then fixtures', () => {
    expect(step(block(), 4, [])).toBe('Add 2 more teams to Ambassadors');
    expect(step(block(), 8, [])).toBe('Generate fixtures');
    expect(step(block({ format: 'knockout' }), 8, [])).toBe('Generate the bracket');
  });

  it('moves from scheduling to scoring to the knockout', () => {
    expect(step(block({ status: 'league' }), 8, many(28))).toBe('Schedule a game day');
    expect(step(block({ status: 'league' }), 8, [game({ scheduled_date: '2026-10-17' })])).toBe('Score the remaining league games');
    expect(step(block({ status: 'league' }), 8, many(28, { status: 'completed' }))).toBe('Generate the knockout');
    expect(step(block({ status: 'knockout' }), 8, many(12, { status: 'completed' }))).toBe('Complete the block');
  });
});
