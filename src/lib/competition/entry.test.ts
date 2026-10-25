import {
  blockingGame,
  bump,
  bumpSet,
  clearImpact,
  defaultActiveSet,
  entryTotals,
  isLevel,
  levelSet,
  setPoints,
  setSetPoints,
  neededCount,
  nextToScore,
  pickRound,
  playedDownstream,
  scoreable,
  startingDetails,
  tiebreakAsk,
  trimDetails,
  type RoundsDetails,
  type SetsDetails,
} from './entry';
import type { GameRecord, ResultRecord, TeamRecord } from './types';

function game(over: Partial<GameRecord> & { id: string }): GameRecord {
  return {
    sport_block_id: 'b1',
    home_team_id: null,
    away_team_id: null,
    stage: 'knockout',
    group_label: null,
    round: 1,
    label: over.id,
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

const teams = new Map<string, TeamRecord>(
  ['a', 'b', 'c', 'd'].map((id) => [id, { id, name: id.toUpperCase(), active: true, division: 'juniors' as const }])
);

const saved = (over: Partial<ResultRecord> = {}): ResultRecord => ({
  game_id: 'g1',
  home_total: 2,
  away_total: 1,
  winner_team_id: 'a',
  tiebreak_winner_team_id: null,
  recorded_by: null,
  recorded_at: '2026-10-19T09:52:00Z',
  details: { home: 2, away: 1 },
  ...over,
});

describe('points', () => {
  it('adds and subtracts but never goes below zero', () => {
    expect(bump({ home: 0, away: 3 }, 'home', -1)).toEqual({ home: 0, away: 3 });
    expect(bump({ home: 1, away: 3 }, 'away', 2)).toEqual({ home: 1, away: 5 });
  });

  it('stops at the largest score the schema takes', () => {
    expect(bump({ home: 999, away: 0 }, 'home', 3).home).toBe(999);
  });
});

describe('volleyball sets', () => {
  const sets = (...rows: [number, number][]): SetsDetails => ({ sets: rows.map(([home, away]) => ({ home, away })) });

  it('edits one set and leaves the others alone', () => {
    const next = bumpSet(sets([25, 21], [0, 0]), 1, 'away', 2);
    expect(next.sets).toEqual([
      { home: 25, away: 21 },
      { home: 0, away: 2 },
    ]);
  });

  it('counts sets won as the total', () => {
    const d = sets([25, 21], [18, 25], [15, 12], [0, 0], [0, 0]);
    expect(entryTotals('volleyball', d, { maxSets: 5 })).toEqual({ home: 2, away: 1 });
  });

  it('knows sets are not needed once a side has three', () => {
    expect(neededCount(['home', 'away', 'home', 'home', null])).toBe(4);
    expect(neededCount(['home', 'home', 'home', null, null])).toBe(3);
    expect(neededCount([null, null, null])).toBe(3);
  });

  it('points the steppers at the first set not yet played', () => {
    expect(defaultActiveSet(sets([25, 21], [18, 25], [0, 0], [0, 0], [0, 0]))).toBe(2);
  });

  it('trims sets that were never needed before saving', () => {
    const trimmed = trimDetails('volleyball', sets([25, 21], [25, 18], [25, 10], [0, 0], [0, 0])) as SetsDetails;
    expect(trimmed.sets).toHaveLength(3);
  });
});

describe('dodgeball rounds', () => {
  const rounds = (...w: ('home' | 'away' | null)[]): RoundsDetails => ({ rounds: w.map((winner) => ({ winner })) });

  it('records a round, and a second tap clears it', () => {
    const once = pickRound(rounds(null, null, null), 1, 'home');
    expect(once.rounds[1].winner).toBe('home');
    expect(pickRound(once, 1, 'home').rounds[1].winner).toBeNull();
  });

  it('switches the winner when the other name is tapped', () => {
    expect(pickRound(rounds('home'), 0, 'away').rounds[0].winner).toBe('away');
  });

  it('totals rounds won', () => {
    expect(entryTotals('dodgeball', rounds('home', 'home', 'away', 'home', null), { maxRounds: 5 })).toEqual({
      home: 3,
      away: 1,
    });
  });

  it('drops unplayed rounds before saving', () => {
    const trimmed = trimDetails('dodgeball', rounds('home', 'home', 'home', null, null)) as RoundsDetails;
    expect(trimmed.rounds).toHaveLength(3);
  });
});

describe('typed scores', () => {
  it('sets a side to exactly the typed number, clamped', () => {
    expect(setPoints({ home: 3, away: 1 }, 'away', 25)).toEqual({ home: 3, away: 25 });
    expect(setPoints({ home: 3, away: 1 }, 'home', -4).home).toBe(0);
    expect(setPoints({ home: 3, away: 1 }, 'home', 5000).home).toBe(999);
    expect(setPoints({ home: 3, away: 1 }, 'home', Number.NaN).home).toBe(0);
  });

  it('sets one volleyball set and leaves the rest', () => {
    const d: SetsDetails = { sets: [{ home: 25, away: 21 }, { home: 0, away: 0 }] };
    expect(setSetPoints(d, 1, 'home', 25).sets).toEqual([{ home: 25, away: 21 }, { home: 25, away: 0 }]);
  });

  it('finds a set that ended level, but not one that has not been played', () => {
    expect(levelSet({ sets: [{ home: 25, away: 21 }, { home: 24, away: 24 }] })).toBe(1);
    expect(levelSet({ sets: [{ home: 25, away: 21 }, { home: 0, away: 0 }] })).toBeNull();
  });

  it('still shows a running total while a set is level', () => {
    const d: SetsDetails = { sets: [{ home: 25, away: 21 }, { home: 24, away: 24 }, { home: 0, away: 0 }] };
    expect(entryTotals('volleyball', d, { maxSets: 5 })).toEqual({ home: 1, away: 0 });
  });
});

describe('level games', () => {
  it('is level only when there are totals and they match', () => {
    expect(isLevel({ home: 2, away: 2 })).toBe(true);
    expect(isLevel({ home: 2, away: 1 })).toBe(false);
    expect(isLevel(null)).toBe(false);
  });

  it('asks the question that fits the sport', () => {
    expect(tiebreakAsk('soccer')).toMatch(/shootout/);
    expect(tiebreakAsk('basketball')).toMatch(/overtime/);
    expect(tiebreakAsk('dodgeball')).toMatch(/extra round/);
  });
});

describe('startingDetails', () => {
  it('starts an unplayed game empty', () => {
    expect(startingDetails('soccer', {}, undefined)).toEqual({ home: 0, away: 0 });
  });

  it('starts a played game from its saved score', () => {
    expect(startingDetails('soccer', {}, saved())).toEqual({ home: 2, away: 1 });
  });

  it('falls back to empty when the saved detail no longer fits', () => {
    expect(startingDetails('soccer', {}, saved({ details: { nonsense: true } }))).toEqual({ home: 0, away: 0 });
  });
});

describe('what a correction or clear touches', () => {
  // QF1 feeds SF1 (winner) and the 5th-place game (loser).
  const qf = game({
    id: 'qf',
    label: 'Quarter-final 1',
    home_team_id: 'a',
    away_team_id: 'b',
    status: 'completed',
    winner_to_game_id: 'sf',
    winner_to_slot: 'home',
    loser_to_game_id: 'fifth',
    loser_to_slot: 'home',
  });
  const sf = (status: GameRecord['status']) =>
    game({ id: 'sf', label: 'Semi-final 1', home_team_id: 'a', away_team_id: 'c', status });
  const fifth = game({ id: 'fifth', label: '5th place', home_team_id: 'b', away_team_id: 'd' });

  it('allows a correction when the later game has not been played', () => {
    expect(blockingGame(qf, [qf, sf('scheduled'), fifth], saved(), 'away')).toBeNull();
  });

  it('allows a score change that keeps the same winner, even after the next game', () => {
    expect(blockingGame(qf, [qf, sf('completed'), fifth], saved(), 'home')).toBeNull();
  });

  it('blocks a winner change once the game it advanced into has been played', () => {
    expect(blockingGame(qf, [qf, sf('completed'), fifth], saved(), 'away')?.id).toBe('sf');
  });

  it('does not block a first result', () => {
    expect(blockingGame(qf, [qf, sf('completed'), fifth], undefined, 'away')).toBeNull();
  });

  it('refuses a clear while a later game has been played', () => {
    expect(playedDownstream(qf, [qf, sf('completed'), fifth])?.id).toBe('sf');
    expect(playedDownstream(qf, [qf, sf('scheduled'), fifth])).toBeNull();
  });

  it('lists what a clear takes back out', () => {
    const lines = clearImpact(qf, [qf, sf('scheduled'), fifth], teams);
    expect(lines).toEqual([
      'A leave Semi-final 1 and go back to waiting for Quarter-final 1',
      'B leave 5th place and go back to waiting for Quarter-final 1',
      'Quarter-final 1 goes back to upcoming and can be scored again',
    ]);
  });
});

describe('nextToScore', () => {
  const at = (id: string, time: string, court: number, over: Partial<GameRecord> = {}) =>
    game({ id, scheduled_date: '2026-10-19', scheduled_time: time, court, home_team_id: 'a', away_team_id: 'b', ...over });

  it('goes to the other game in the same slot before the next slot', () => {
    const games = [at('g1', '09:45:00', 1), at('g2', '09:45:00', 2), at('g3', '10:30:00', 1)];
    expect(nextToScore(games[0], games)?.id).toBe('g2');
  });

  it('still finds the unplayed game on a lower court in the same slot', () => {
    const games = [at('g1', '09:45:00', 1), at('g2', '09:45:00', 2), at('g3', '10:30:00', 1)];
    expect(nextToScore(games[1], games)?.id).toBe('g1');
  });

  it('moves to the next slot, lowest court first, once the slot is done', () => {
    const games = [
      at('g1', '09:45:00', 1),
      at('g2', '09:45:00', 2, { status: 'completed' }),
      at('g4', '10:30:00', 2),
      at('g3', '10:30:00', 1),
    ];
    expect(nextToScore(games[0], games)?.id).toBe('g3');
  });

  it('skips played games and games still waiting on a team', () => {
    const games = [
      at('g1', '09:45:00', 1),
      at('g2', '10:30:00', 1, { status: 'completed' }),
      at('g3', '10:30:00', 2, { home_team_id: null }),
      at('g4', '11:15:00', 1),
    ];
    expect(nextToScore(games[0], games)?.id).toBe('g4');
  });

  it('finds nothing after the last game, and nothing for an unscheduled game', () => {
    const games = [at('g1', '09:45:00', 1)];
    expect(nextToScore(games[0], games)).toBeNull();
    expect(nextToScore(game({ id: 'x' }), games)).toBeNull();
  });
});

describe('scoreable', () => {
  const ready = game({ id: 'g', home_team_id: 'a', away_team_id: 'b' });

  it('needs both teams', () => {
    expect(scoreable(game({ id: 'g', home_team_id: 'a' }), 'knockout')).toBe(false);
  });

  it('is closed once the block is completed', () => {
    expect(scoreable(ready, 'completed')).toBe(false);
  });

  it('locks league games once the knockout stage exists', () => {
    expect(scoreable({ ...ready, stage: 'league' }, 'knockout')).toBe(false);
    expect(scoreable({ ...ready, stage: 'league' }, 'league')).toBe(true);
    expect(scoreable(ready, 'knockout')).toBe(true);
  });
});
