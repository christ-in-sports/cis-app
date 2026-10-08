import { seededRng, shuffle } from './rng';
import {
  emptyDetails,
  isKnownSport,
  parseDetails,
  resolveWinner,
  sportColumns,
  sportSettings,
} from './scores';

describe('parseDetails', () => {
  it.each(['soccer', 'basketball'])('reads goals or points for %s', (sport) => {
    expect(parseDetails(sport, { home: 3, away: 1 })).toEqual({
      ok: true,
      details: { home: 3, away: 1 },
      totals: { home: 3, away: 1 },
    });
  });

  it('rejects negative, fractional and missing scores', () => {
    expect(parseDetails('soccer', { home: -1, away: 0 }).ok).toBe(false);
    expect(parseDetails('soccer', { home: 1.5, away: 0 }).ok).toBe(false);
    expect(parseDetails('soccer', { home: 1 }).ok).toBe(false);
    expect(parseDetails('soccer', null).ok).toBe(false);
  });

  it('counts sets won for volleyball and ignores a set still at 0-0', () => {
    const result = parseDetails('volleyball', {
      sets: [
        { home: 25, away: 20 },
        { home: 18, away: 25 },
        { home: 25, away: 22 },
        { home: 0, away: 0 },
        { home: 0, away: 0 },
      ],
    });
    expect(result).toMatchObject({ ok: true, totals: { home: 2, away: 1 } });
  });

  it('limits volleyball sets to the block setting, defaulting to 5', () => {
    const six = { sets: Array.from({ length: 6 }, () => ({ home: 25, away: 20 })) };
    expect(parseDetails('volleyball', six)).toEqual({ ok: false, error: 'At most 5 sets' });
    expect(parseDetails('volleyball', six, { maxSets: 7 }).ok).toBe(true);
    const four = { sets: Array.from({ length: 4 }, () => ({ home: 25, away: 20 })) };
    expect(parseDetails('volleyball', four, { maxSets: 3 })).toEqual({ ok: false, error: 'At most 3 sets' });
  });

  it('counts rounds won for dodgeball and limits the rounds', () => {
    const result = parseDetails('dodgeball', {
      rounds: [{ winner: 'home' }, { winner: 'away' }, { winner: 'home' }, { winner: null }],
    });
    expect(result).toMatchObject({ ok: true, totals: { home: 2, away: 1 } });
    const six = { rounds: Array.from({ length: 6 }, () => ({ winner: 'home' })) };
    expect(parseDetails('dodgeball', six)).toEqual({ ok: false, error: 'At most 5 rounds' });
    expect(parseDetails('dodgeball', { rounds: [{ winner: 'draw' }] }).ok).toBe(false);
  });

  it('throws for a sport that is not in the registry', () => {
    expect(() => parseDetails('curling', {})).toThrow(/Unknown sport/);
    expect(isKnownSport('soccer')).toBe(true);
    expect(isKnownSport('curling')).toBe(false);
    expect(isKnownSport('toString')).toBe(false);
  });
});

describe('sport helpers', () => {
  it('labels the standings columns per sport', () => {
    expect(sportColumns('soccer')).toEqual({ difference: 'GD', scored: 'GF' });
    expect(sportColumns('basketball')).toEqual({ difference: 'PD', scored: 'PF' });
    expect(sportColumns('volleyball')).toEqual({ difference: 'SD', scored: 'SW' });
    expect(sportColumns('dodgeball')).toEqual({ difference: 'RD', scored: 'RW' });
  });

  it('fills in the sport defaults without overriding the block', () => {
    expect(sportSettings('volleyball')).toMatchObject({ maxSets: 5, gameMinutes: 20 });
    expect(sportSettings('volleyball', { maxSets: 3 })).toMatchObject({ maxSets: 3, gameMinutes: 20 });
    expect(sportSettings('dodgeball')).toMatchObject({ maxRounds: 5, gameMinutes: 15 });
  });

  it('builds blank details that pass validation', () => {
    for (const sport of ['soccer', 'basketball', 'volleyball', 'dodgeball']) {
      const blank = emptyDetails(sport);
      expect(parseDetails(sport, blank)).toMatchObject({ ok: true, totals: { home: 0, away: 0 } });
    }
    expect(emptyDetails('volleyball', { maxSets: 3 })).toEqual({
      sets: [
        { home: 0, away: 0 },
        { home: 0, away: 0 },
        { home: 0, away: 0 },
      ],
    });
  });
});

describe('resolveWinner', () => {
  it('lets a league game be drawn', () => {
    expect(resolveWinner('league', { home: 2, away: 2 })).toEqual({ ok: true, winner: null });
  });

  it('picks the higher total in a league game and refuses a tiebreak', () => {
    expect(resolveWinner('league', { home: 3, away: 1 })).toEqual({ ok: true, winner: 'home' });
    expect(resolveWinner('league', { home: 0, away: 1 })).toEqual({ ok: true, winner: 'away' });
    expect(resolveWinner('league', { home: 2, away: 2 }, 'home').ok).toBe(false);
  });

  it.each(['knockout', 'placement'] as const)('needs a tiebreak winner for a level %s game', (stage) => {
    expect(resolveWinner(stage, { home: 1, away: 1 }).ok).toBe(false);
    expect(resolveWinner(stage, { home: 1, away: 1 }, 'away')).toEqual({ ok: true, winner: 'away' });
  });

  it('refuses a tiebreak winner when the score is not level', () => {
    expect(resolveWinner('knockout', { home: 2, away: 1 }, 'away').ok).toBe(false);
    expect(resolveWinner('knockout', { home: 2, away: 1 })).toEqual({ ok: true, winner: 'home' });
  });
});

describe('shuffle', () => {
  it('keeps every item and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seededRng(9));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reaches every position about equally often', () => {
    // Over many shuffles each of 4 items should land in each slot ~25% of the time.
    const rng = seededRng(42);
    const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const runs = 8000;
    for (let i = 0; i < runs; i++) {
      shuffle([0, 1, 2, 3], rng).forEach((item, pos) => counts[item][pos]++);
    }
    for (const row of counts) {
      for (const n of row) expect(Math.abs(n / runs - 0.25)).toBeLessThan(0.03);
    }
  });

  it('is repeatable with the same seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], seededRng(1))).toEqual(shuffle([1, 2, 3, 4, 5], seededRng(1)));
  });
});
