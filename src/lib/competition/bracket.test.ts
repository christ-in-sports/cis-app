import { seededRng } from './rng';
import {
  generateBracket,
  randomSeeds,
  validateBracket,
  type BracketShape,
  type PlanGame,
} from './bracket';

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);
const CONFIGS: [number, BracketShape][] = [6, 7, 8].flatMap((n) =>
  (['full', 'split'] as const).map((shape): [number, BracketShape] => [n, shape])
);

/**
 * Plays a bracket to the end, following the edges, with `pick(gameIndex)`
 * choosing each game's winner (true = home). Returns each team's place, and
 * the teams every game was played between.
 */
function play(games: PlanGame[], pick: (i: number) => boolean) {
  const order = [...games].sort((a, b) => a.round - b.round);
  const teams = new Map(games.map((g) => [g.key, { home: g.home, away: g.away }]));
  const places = new Map<string, number>();
  const played = new Map<string, { home: string; away: string; winner: string }>();

  order.forEach((g, i) => {
    const { home, away } = teams.get(g.key)!;
    if (!home || !away) throw new Error(`${g.key} reached with a missing team (${home}, ${away})`);
    const homeWins = pick(i);
    const [winner, loser] = homeWins ? [home, away] : [away, home];
    played.set(g.key, { home, away, winner });
    for (const [side, team] of [['winner', winner], ['loser', loser]] as const) {
      const to = g[`${side}To`];
      const place = g[`${side}Place`];
      if (to) teams.get(to.key)![to.slot] = team;
      if (place !== undefined) places.set(team, place);
    }
  });
  return { places, played };
}

describe('generateBracket', () => {
  it.each(CONFIGS)('is a sound graph with %i teams (%s)', (n, shape) => {
    expect(validateBracket(generateBracket({ seeds: seeds(n), shape }), n)).toEqual([]);
  });

  it.each(CONFIGS)(
    'every possible outcome with %i teams (%s) gives each team a distinct place 1..N',
    (n, shape) => {
      const games = generateBracket({ seeds: seeds(n), shape });
      const outcomes = 2 ** games.length;
      for (let mask = 0; mask < outcomes; mask++) {
        const { places } = play(games, (i) => ((mask >> i) & 1) === 1);
        expect([...places.values()].sort((a, b) => a - b)).toEqual(
          Array.from({ length: n }, (_, i) => i + 1)
        );
        expect(new Set(places.keys())).toEqual(new Set(seeds(n)));
      }
    }
  );

  it('rejects counts outside 6 to 8 and duplicate seeds', () => {
    expect(() => generateBracket({ seeds: seeds(5), shape: 'full' })).toThrow(/6 to 8/);
    expect(() => generateBracket({ seeds: seeds(9), shape: 'split' })).toThrow(/6 to 8/);
    expect(() =>
      generateBracket({ seeds: ['a', 'a', 'b', 'c', 'd', 'e'], shape: 'full' })
    ).toThrow(/distinct/);
  });
});

describe('prototype bugs', () => {
  it('6 teams after a league: the 5th-place winner can never reach the final', () => {
    const games = generateBracket({ seeds: seeds(6), shape: 'split' });
    const fifth = games.find((g) => g.key === '5P')!;
    expect(fifth.winnerTo).toBeUndefined();
    expect(fifth.winnerPlace).toBe(5);
    expect(fifth.loserPlace).toBe(6);
    const final = games.find((g) => g.key === 'F')!;
    expect(final.home).toBeNull();
    expect(final.away).toBeNull();
  });

  it('8 teams knockout-only: the 5th to 8th games are all fed', () => {
    const games = generateBracket({ seeds: seeds(8), shape: 'full' });
    for (const key of ['PS1', 'PS2', '5P', '7P']) {
      const g = games.find((x) => x.key === key)!;
      const fed = (slot: 'home' | 'away') =>
        g[slot] !== null ||
        games.some((o) => [o.winnerTo, o.loserTo].some((e) => e?.key === key && e.slot === slot));
      expect(fed('home') && fed('away')).toBe(true);
    }
  });

  it('6 teams knockout-only: the 5th-place game is fed by the quarter-final losers', () => {
    const games = generateBracket({ seeds: seeds(6), shape: 'full' });
    const qf = games.filter((g) => g.key.startsWith('QF'));
    expect(qf.map((g) => g.loserTo?.key)).toEqual(['5P', '5P']);
  });

  it('7 teams are supported in both shapes', () => {
    for (const shape of ['full', 'split'] as const) {
      expect(validateBracket(generateBracket({ seeds: seeds(7), shape }), 7)).toEqual([]);
    }
  });
});

describe('seeding', () => {
  it('puts byes straight into the next game, not into a fake game', () => {
    const games = generateBracket({ seeds: seeds(6), shape: 'full' });
    expect(games.find((g) => g.key === 'SF1')!.home).toBe('s1');
    expect(games.find((g) => g.key === 'SF2')!.home).toBe('s2');
    expect(games).toHaveLength(7);
  });

  it('pairs two groups A1 v B2 and B1 v A2 in the semi-finals', () => {
    const interleaved = ['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4'];
    const games = generateBracket({ seeds: interleaved, shape: 'split' });
    const semi = (key: string) => games.find((g) => g.key === key)!;
    expect([semi('SF1').home, semi('SF1').away]).toEqual(['A1', 'B2']);
    expect([semi('SF2').home, semi('SF2').away]).toEqual(['B1', 'A2']);
    expect([semi('PS1').home, semi('PS1').away]).toEqual(['A3', 'B4']);
    expect([semi('PS2').home, semi('PS2').away]).toEqual(['B3', 'A4']);
  });

  it('randomSeeds is repeatable with the same rng and keeps every team', () => {
    expect(randomSeeds(seeds(8), seededRng(5))).toEqual(randomSeeds(seeds(8), seededRng(5)));
    expect(new Set(randomSeeds(seeds(8), seededRng(5)))).toEqual(new Set(seeds(8)));
  });
});

describe('validateBracket', () => {
  it('flags a slot filled twice and a missing place', () => {
    const games = generateBracket({ seeds: seeds(6), shape: 'split' });
    const broken = games.map((g) => ({ ...g }));
    broken.find((g) => g.key === 'SF2')!.winnerTo = { key: 'F', slot: 'home' };
    expect(validateBracket(broken, 6).join(' ')).toMatch(/filled twice/);

    const noPlace = games.map((g) => ({ ...g }));
    delete noPlace.find((g) => g.key === '5P')!.loserPlace;
    expect(validateBracket(noPlace, 6).join(' ')).toMatch(/neither an exit nor a place/);
  });
});
