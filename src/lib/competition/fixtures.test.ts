import { seededRng } from './rng';
import {
  assertTeamCount,
  drawGroups,
  generateLeague,
  roundRobin,
  type LeagueFixture,
} from './fixtures';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

describe('roundRobin', () => {
  it.each([6, 7, 8])('plays every pair exactly once with %i teams', (n) => {
    const fixtures = roundRobin(teams(n));
    expect(fixtures).toHaveLength((n * (n - 1)) / 2);
    const pairs = fixtures.map((f) => pairKey(f.home, f.away));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it.each([6, 7, 8])('never has a team play twice in a round with %i teams', (n) => {
    const byRound = new Map<number, string[]>();
    for (const f of roundRobin(teams(n))) {
      byRound.set(f.round, [...(byRound.get(f.round) ?? []), f.home, f.away]);
    }
    for (const playing of byRound.values()) {
      expect(new Set(playing).size).toBe(playing.length);
    }
  });

  it('uses n-1 rounds for an even count and n rounds for an odd count', () => {
    const rounds = (n: number) => Math.max(...roundRobin(teams(n)).map((f) => f.round));
    expect(rounds(8)).toBe(7);
    expect(rounds(6)).toBe(5);
    expect(rounds(7)).toBe(7);
  });

  it('gives each team in a 7-team league exactly one bye', () => {
    const fixtures = roundRobin(teams(7));
    for (const team of teams(7)) {
      const played = new Set(
        fixtures.filter((f) => f.home === team || f.away === team).map((f) => f.round)
      );
      expect(played.size).toBe(6);
    }
  });

  it('gives every team between 2 and 5 home games out of 7 (8 teams)', () => {
    const fixtures = roundRobin(teams(8));
    for (const team of teams(8)) {
      const home = fixtures.filter((f) => f.home === team).length;
      expect(home).toBeGreaterThanOrEqual(2);
      expect(home).toBeLessThanOrEqual(5);
    }
  });
});

describe('drawGroups', () => {
  it.each([
    [6, 3, 3],
    [7, 4, 3],
    [8, 4, 4],
  ])('splits %i teams into %i and %i', (n, a, b) => {
    const groups = drawGroups(teams(n), seededRng(1));
    expect(groups.A).toHaveLength(a);
    expect(groups.B).toHaveLength(b);
    expect(new Set([...groups.A, ...groups.B])).toEqual(new Set(teams(n)));
  });

  it('is repeatable with the same rng and does not mutate its input', () => {
    const input = teams(8);
    const copy = [...input];
    expect(drawGroups(input, seededRng(7))).toEqual(drawGroups(input, seededRng(7)));
    expect(input).toEqual(copy);
  });
});

describe('generateLeague', () => {
  it('has no groups for a round-robin', () => {
    const league = generateLeague(teams(8), 'round_robin', seededRng(1));
    expect(league.groups).toBeNull();
    expect(league.fixtures).toHaveLength(28);
    expect(league.fixtures.every((f) => f.group === null)).toBe(true);
  });

  it.each([6, 7, 8])('keeps group fixtures inside their group with %i teams', (n) => {
    const league = generateLeague(teams(n), 'groups', seededRng(3));
    const groups = league.groups!;
    const inGroup = (f: LeagueFixture) => groups[f.group!].includes(f.home) && groups[f.group!].includes(f.away);
    expect(league.fixtures.every(inGroup)).toBe(true);
    const size = (g: 'A' | 'B') => groups[g].length;
    expect(league.fixtures).toHaveLength(
      (size('A') * (size('A') - 1)) / 2 + (size('B') * (size('B') - 1)) / 2
    );
  });

  it('rejects team counts outside 6 to 8, and duplicates', () => {
    expect(() => generateLeague(teams(5), 'round_robin')).toThrow(/6 to 8/);
    expect(() => generateLeague(teams(9), 'groups')).toThrow(/6 to 8/);
    expect(() => assertTeamCount(['a', 'a', 'b', 'c', 'd', 'e'])).toThrow(/distinct/);
  });
});
