import { generateBracket, validateBracket, type BracketShape } from './bracket';
import { generateLeague } from './fixtures';
import {
  bracketToRpc,
  interleaveGroups,
  leagueSeeds,
  leagueToRpc,
  placedOnDay,
  slotOfTime,
  toClearItems,
  toMinutes,
  toScheduleItems,
  toSchedulableGames,
  type LeagueGame,
} from './plan';
import { seededRng } from './rng';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

describe('leagueToRpc', () => {
  it('numbers games, labels rounds, and carries the group', () => {
    const league = generateLeague(ids(8), 'groups', seededRng(1));
    const rpc = leagueToRpc(league.fixtures);

    expect(rpc).toHaveLength(12);
    expect(new Set(rpc.map((g) => g.key)).size).toBe(12);
    expect(rpc.every((g) => g.stage === 'league' && g.home_team_id && g.away_team_id)).toBe(true);
    expect(rpc.filter((g) => g.group_label === 'A')).toHaveLength(6);
    expect(rpc.filter((g) => g.group_label === 'B')).toHaveLength(6);
    expect(rpc[0].label).toBe(`Round ${rpc[0].round}`);
  });

  it('leaves group_label null for a round-robin', () => {
    const rpc = leagueToRpc(generateLeague(ids(6), 'round_robin', seededRng(1)).fixtures);
    expect(rpc).toHaveLength(15);
    expect(rpc.every((g) => g.group_label === null)).toBe(true);
  });
});

describe('bracketToRpc', () => {
  const cases: [BracketShape, number][] = [6, 7, 8].flatMap((n) => [
    ['full', n] as [BracketShape, number],
    ['split', n] as [BracketShape, number],
  ]);

  it.each(cases)('turns a %s bracket of %i teams into the shape the database reads', (shape, n) => {
    const plan = generateBracket({ seeds: ids(n), shape });
    expect(validateBracket(plan, n)).toEqual([]);
    const rpc = bracketToRpc(plan);

    expect(rpc).toHaveLength(plan.length);
    for (const [i, g] of rpc.entries()) {
      const p = plan[i];
      expect(g.key).toBe(p.key);
      expect(g.home_team_id).toBe(p.home);
      expect(g.away_team_id).toBe(p.away);
      // Exactly one exit per side, matching what create_sport_block_games enforces.
      expect(Boolean(g.winner_to) !== (g.winner_place !== undefined)).toBe(true);
      expect(Boolean(g.loser_to) !== (g.loser_place !== undefined)).toBe(true);
      expect(Object.keys(g)).not.toContain('winnerTo');
    }
  });

  it('serialises without undefined keys, since PostgREST receives JSON', () => {
    const rpc = bracketToRpc(generateBracket({ seeds: ids(6), shape: 'full' }));
    const roundTrip = JSON.parse(JSON.stringify(rpc));
    expect(roundTrip).toEqual(rpc);
  });
});

describe('interleaveGroups', () => {
  it('weaves two tables, first group first', () => {
    expect(interleaveGroups(['A1', 'A2', 'A3'], ['B1', 'B2', 'B3'])).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  });

  it('copes with a group of four and a group of three', () => {
    expect(interleaveGroups(['A1', 'A2', 'A3', 'A4'], ['B1', 'B2', 'B3'])).toEqual([
      'A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4',
    ]);
  });
});

describe('leagueSeeds', () => {
  const teams = ids(8).map((id) => ({ id, name: id }));

  /** Every game won by the lower-numbered team, so the order is t1, t2, ... within a group. */
  const play = (games: LeagueGame[]) =>
    games.map((g) => {
      const homeWins = Number(g.home.slice(1)) < Number(g.away.slice(1));
      return { gameId: g.id, homeTotal: homeWins ? 1 : 0, awayTotal: homeWins ? 0 : 1 };
    });

  it('ranks a round-robin by its single table', () => {
    const league = generateLeague(ids(8), 'round_robin', seededRng(3));
    const games = league.fixtures.map((f, i) => ({ id: `g${i}`, home: f.home, away: f.away, group: null }));
    const seeds = leagueSeeds({ structure: 'round_robin', teams, games, results: play(games) });
    expect(seeds).toEqual(ids(8));
  });

  it('weaves two group tables so the groups meet in the semi-finals', () => {
    const league = generateLeague(ids(8), 'groups', seededRng(3));
    const games = league.fixtures.map((f, i) => ({ id: `g${i}`, home: f.home, away: f.away, group: f.group }));
    const seeds = leagueSeeds({ structure: 'groups', teams, games, results: play(games) });

    const inA = new Set(league.groups!.A);
    expect(seeds).toHaveLength(8);
    // Seeds alternate groups: A, B, A, B, ...
    seeds.forEach((s, i) => expect(inA.has(s)).toBe(i % 2 === 0));
    // Within a group the table order holds (lower number is better here).
    const a = seeds.filter((_, i) => i % 2 === 0).map((s) => Number(s.slice(1)));
    expect(a).toEqual([...a].sort((x, y) => x - y));

    // So the semi-finals pair one group's winner with the other's runner-up.
    const bracket = generateBracket({ seeds, shape: 'split' });
    const sf1 = bracket.find((g) => g.key === 'SF1')!;
    const sf2 = bracket.find((g) => g.key === 'SF2')!;
    for (const sf of [sf1, sf2]) expect(inA.has(sf.home!)).not.toBe(inA.has(sf.away!));
  });

  it('handles groups of 4 and 3 (seven teams)', () => {
    const seven = ids(7).map((id) => ({ id, name: id }));
    const league = generateLeague(ids(7), 'groups', seededRng(5));
    const games = league.fixtures.map((f, i) => ({ id: `g${i}`, home: f.home, away: f.away, group: f.group }));
    const seeds = leagueSeeds({ structure: 'groups', teams: seven, games, results: play(games) });
    expect(new Set(seeds).size).toBe(7);
    expect(validateBracket(generateBracket({ seeds, shape: 'split' }), 7)).toEqual([]);
  });
});

describe('scheduling helpers', () => {
  it('reads Postgres and plain clock times', () => {
    expect(toMinutes('14:00')).toBe(840);
    expect(toMinutes('14:20:00')).toBe(860);
  });

  it('finds the slot a time starts, and rejects times off the grid', () => {
    expect(slotOfTime('14:00', '14:00:00', 20, 6)).toBe(1);
    expect(slotOfTime('14:00', '14:40:00', 20, 6)).toBe(3);
    expect(slotOfTime('14:00', '14:30:00', 20, 6)).toBeNull(); // not a slot start
    expect(slotOfTime('14:00', '13:40:00', 20, 6)).toBeNull(); // before the day
    expect(slotOfTime('14:00', '16:00:00', 20, 6)).toBeNull(); // slot 7 of 6
  });

  it('maps games already on the day to their cells, whichever block they are in', () => {
    const grid = { startTime: '14:00', gameMinutes: 20, slots: 4, courts: 2 };
    const placed = placedOnDay(
      [
        { id: 'a', home_team_id: 'x', away_team_id: 'y', scheduled_time: '14:00:00', court: 1 },
        { id: 'b', home_team_id: 'p', away_team_id: 'q', scheduled_time: '14:20:00', court: 2 },
        { id: 'c', home_team_id: 'r', away_team_id: 's', scheduled_time: '14:10:00', court: 1 }, // off grid
        { id: 'd', home_team_id: 'u', away_team_id: 'v', scheduled_time: '14:00:00', court: 3 }, // court not in use today
        { id: 'e', home_team_id: 'w', away_team_id: 'z', scheduled_time: null, court: null },
      ],
      grid
    );
    expect(placed).toEqual([
      { id: 'a', home: 'x', away: 'y', slot: 1, court: 1 },
      { id: 'b', home: 'p', away: 'q', slot: 2, court: 2 },
    ]);
  });

  it('works out which games feed which, and keeps placement games after the main bracket', () => {
    const rows = [
      { id: 'sf1', home_team_id: 'a', away_team_id: 'b', stage: 'knockout' as const, round: 1, winner_to_game_id: 'f', loser_to_game_id: 'third' },
      { id: 'sf2', home_team_id: 'c', away_team_id: 'd', stage: 'knockout' as const, round: 1, winner_to_game_id: 'f', loser_to_game_id: 'third' },
      { id: 'f', home_team_id: null, away_team_id: null, stage: 'knockout' as const, round: 2, winner_to_game_id: null, loser_to_game_id: null },
      { id: 'third', home_team_id: null, away_team_id: null, stage: 'placement' as const, round: 2, winner_to_game_id: null, loser_to_game_id: null },
    ];
    const games = toSchedulableGames(rows);
    const byId = Object.fromEntries(games.map((g) => [g.id, g]));

    expect([...(byId.f.feeders ?? [])].sort()).toEqual(['sf1', 'sf2']);
    expect([...(byId.third.feeders ?? [])].sort()).toEqual(['sf1', 'sf2']);
    expect(byId.sf1.feeders).toEqual([]);
    expect(byId.third.order).toBeGreaterThan(byId.f.order!);
  });

  it('builds schedule items with clock times, and clear items with nulls', () => {
    const items = toScheduleItems(
      [
        { gameId: 'g1', slot: 1, court: 1 },
        { gameId: 'g2', slot: 3, court: 2 },
      ],
      { date: '2026-10-17', startTime: '14:00', gameMinutes: 20 }
    );
    expect(items).toEqual([
      { game_id: 'g1', scheduled_date: '2026-10-17', scheduled_time: '14:00', court: 1 },
      { game_id: 'g2', scheduled_date: '2026-10-17', scheduled_time: '14:40', court: 2 },
    ]);
    expect(toClearItems(['g1'])).toEqual([
      { game_id: 'g1', scheduled_date: null, scheduled_time: null, court: null },
    ]);
  });
});
