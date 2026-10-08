import { generateBracket } from './bracket';
import { roundRobin } from './fixtures';
import { scheduleDay, slotTime, type SchedulableGame } from './scheduler';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

const leagueGames = (n: number): SchedulableGame[] =>
  roundRobin(teams(n)).map((f, i) => ({
    id: `L${i}`,
    home: f.home,
    away: f.away,
    stage: 'league',
    round: f.round,
  }));

describe('scheduleDay', () => {
  it('never puts a team in two games in the same slot', () => {
    const games = leagueGames(8);
    const { assignments } = scheduleDay({ slots: 14, courts: 2, games });
    const bySlot = new Map<number, string[]>();
    for (const a of assignments) {
      const g = games.find((x) => x.id === a.gameId)!;
      bySlot.set(a.slot, [...(bySlot.get(a.slot) ?? []), g.home!, g.away!]);
    }
    for (const playing of bySlot.values()) expect(new Set(playing).size).toBe(playing.length);
  });

  it('uses each cell at most once and stays inside the grid', () => {
    const { assignments } = scheduleDay({ slots: 6, courts: 3, games: leagueGames(8) });
    const cells = assignments.map((a) => `${a.slot}:${a.court}`);
    expect(new Set(cells).size).toBe(cells.length);
    for (const a of assignments) {
      expect(a.slot).toBeGreaterThanOrEqual(1);
      expect(a.slot).toBeLessThanOrEqual(6);
      expect(a.court).toBeGreaterThanOrEqual(1);
      expect(a.court).toBeLessThanOrEqual(3);
    }
  });

  it('places as many games as fit and reports the rest as unplaced', () => {
    const games = leagueGames(8); // 28 games
    const result = scheduleDay({ slots: 4, courts: 2, games });
    expect(result.assignments.length).toBeLessThanOrEqual(8);
    expect(result.assignments.length + result.unplaced.length).toBe(28);
  });

  it('avoids a third game in a row when another game fits', () => {
    // Team a already plays slots 1 and 2; c and d played slot 2. One cell is
    // left, in slot 3. Rest alone would favour a v b (a has played only twice
    // and b not at all), but that would be a's third game in a row.
    const placed = [
      { id: 'p1', home: 'a', away: 'x', slot: 1, court: 1 },
      { id: 'p2', home: 'z1', away: 'z2', slot: 1, court: 2 },
      { id: 'p3', home: 'a', away: 'y', slot: 2, court: 1 },
      { id: 'p4', home: 'c', away: 'd', slot: 2, court: 2 },
      { id: 'p5', home: 'z3', away: 'z4', slot: 3, court: 2 },
    ];
    const games: SchedulableGame[] = [
      { id: 'ab', home: 'a', away: 'b', stage: 'league', round: 1 },
      { id: 'cd', home: 'c', away: 'd', stage: 'league', round: 2 },
    ];
    const { assignments } = scheduleDay({ slots: 3, courts: 2, games, placed });
    expect(assignments).toEqual([{ gameId: 'cd', slot: 3, court: 1 }]);
  });

  it('still plays a third game in a row when nothing else fits', () => {
    const placed = [
      { id: 'p1', home: 'a', away: 'x', slot: 1, court: 1 },
      { id: 'p2', home: 'a', away: 'y', slot: 2, court: 1 },
    ];
    const games: SchedulableGame[] = [{ id: 'ab', home: 'a', away: 'b', stage: 'league', round: 1 }];
    const { assignments } = scheduleDay({ slots: 3, courts: 1, games, placed });
    expect(assignments).toEqual([{ gameId: 'ab', slot: 3, court: 1 }]);
  });

  it('schedules games with both teams known before games still waiting on a result', () => {
    const games: SchedulableGame[] = [
      { id: 'wait', home: null, away: null, stage: 'knockout', round: 2 },
      { id: 'known', home: 'a', away: 'b', stage: 'knockout', round: 1 },
    ];
    const { assignments } = scheduleDay({ slots: 1, courts: 1, games });
    expect(assignments).toEqual([{ gameId: 'known', slot: 1, court: 1 }]);
  });

  it('plays league games before knockout games when teams are free', () => {
    const games: SchedulableGame[] = [
      { id: 'ko', home: 'a', away: 'b', stage: 'knockout', round: 1 },
      { id: 'lg', home: 'a', away: 'b', stage: 'league', round: 1 },
    ];
    const { assignments } = scheduleDay({ slots: 1, courts: 1, games });
    expect(assignments[0].gameId).toBe('lg');
  });

  it('puts a waiting game strictly after every game that feeds it', () => {
    const bracket = generateBracket({ seeds: teams(8), shape: 'split' });
    const idOf = (key: string) => `K-${key}`;
    const feeders = (key: string) =>
      bracket
        .filter((g) => g.winnerTo?.key === key || g.loserTo?.key === key)
        .map((g) => idOf(g.key));
    const games: SchedulableGame[] = bracket.map((g) => ({
      id: idOf(g.key),
      home: g.home,
      away: g.away,
      stage: g.stage,
      round: g.round,
      feeders: feeders(g.key),
    }));

    const { assignments, unplaced } = scheduleDay({ slots: 6, courts: 2, games });
    expect(unplaced).toEqual([]);
    const slotOf = new Map(assignments.map((a) => [a.gameId, a.slot]));
    for (const g of games) {
      for (const f of g.feeders ?? []) {
        expect(slotOf.get(g.id)!).toBeGreaterThan(slotOf.get(f)!);
      }
    }
  });

  it('does not place a waiting game when its feeder is not placed', () => {
    const games: SchedulableGame[] = [
      { id: 'feeder', home: 'a', away: 'b', stage: 'knockout', round: 1 },
      { id: 'final', home: null, away: null, stage: 'knockout', round: 2, feeders: ['feeder'] },
    ];
    // One cell: the feeder takes it, so the final has nowhere to go after it.
    const { assignments, unplaced } = scheduleDay({ slots: 1, courts: 1, games });
    expect(assignments.map((a) => a.gameId)).toEqual(['feeder']);
    expect(unplaced).toEqual(['final']);
  });

  it('fills only free cells when games are already placed', () => {
    const games = leagueGames(6).slice(0, 4);
    const placed = [{ id: 'P', home: 't1', away: 't2', slot: 1, court: 1 }];
    const { assignments } = scheduleDay({ slots: 2, courts: 1, games, placed });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ slot: 2, court: 1 });
  });

  it('treats a team already placed in a slot as busy', () => {
    const games: SchedulableGame[] = [{ id: 'g', home: 't1', away: 't3', stage: 'league', round: 1 }];
    const placed = [{ id: 'P', home: 't1', away: 't2', slot: 1, court: 1 }];
    const { assignments } = scheduleDay({ slots: 2, courts: 2, games, placed });
    expect(assignments).toEqual([{ gameId: 'g', slot: 2, court: 1 }]);
  });

  it('counts empty cells it could not fill', () => {
    const result = scheduleDay({ slots: 2, courts: 2, games: leagueGames(6).slice(0, 1) });
    expect(result.assignments).toHaveLength(1);
    expect(result.openCells).toBe(3);
  });
});

describe('slotTime', () => {
  it('adds the game length for each slot', () => {
    expect(slotTime('14:00', 1, 20)).toBe('14:00');
    expect(slotTime('14:00', 4, 20)).toBe('15:00');
    expect(slotTime('09:30', 3, 15)).toBe('10:00');
  });

  it('wraps past midnight', () => {
    expect(slotTime('23:30', 3, 20)).toBe('00:10');
  });
});
