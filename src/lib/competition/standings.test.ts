import { generateBracket } from './bracket';
import {
  finalPlaces,
  rankStandings,
  type StandingsGame,
  type StandingsResult,
  type StandingsTeam,
} from './standings';

const team = (id: string, name = id.toUpperCase()): StandingsTeam => ({ id, name });
const teams = (...ids: string[]) => ids.map((id) => team(id));

/** Builds games and results from `[home, away, homeGoals, awayGoals]` rows. */
function league(rows: [string, string, number, number][]) {
  const games: StandingsGame[] = [];
  const results: StandingsResult[] = [];
  rows.forEach(([home, away, h, a], i) => {
    games.push({ id: `g${i}`, home, away });
    results.push({ gameId: `g${i}`, homeTotal: h, awayTotal: a });
  });
  return { games, results };
}

const order = (rows: { teamId: string }[]) => rows.map((r) => r.teamId);

describe('rankStandings', () => {
  it('scores 3 for a win, 1 for a draw and 0 for a loss', () => {
    const { games, results } = league([
      ['a', 'b', 2, 0],
      ['a', 'c', 1, 1],
    ]);
    const rows = rankStandings(teams('a', 'b', 'c'), games, results);
    const a = rows.find((r) => r.teamId === 'a')!;
    expect(a).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, points: 4, scored: 3, conceded: 1, difference: 2 });
    expect(rows.find((r) => r.teamId === 'c')!.points).toBe(1);
    expect(rows.find((r) => r.teamId === 'b')!.points).toBe(0);
  });

  it('ignores games with no result and results for unknown games', () => {
    const rows = rankStandings(
      teams('a', 'b'),
      [{ id: 'g0', home: 'a', away: 'b' }],
      [{ gameId: 'nope', homeTotal: 5, awayTotal: 0 }]
    );
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it('numbers ranks from 1 in order', () => {
    const { games, results } = league([['a', 'b', 1, 0]]);
    const rows = rankStandings(teams('a', 'b'), games, results);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    expect(order(rows)).toEqual(['a', 'b']);
  });

  describe('head-to-head versus difference first', () => {
    // a and b tie on 6 points. a beat b 1-0, but b has the far better
    // difference thanks to a big win over c.
    const { games, results } = league([
      ['a', 'b', 1, 0],
      ['a', 'c', 0, 1],
      ['a', 'd', 1, 0],
      ['b', 'c', 6, 0],
      ['b', 'd', 1, 0],
      ['c', 'd', 0, 3],
    ]);
    const t = teams('a', 'b', 'c', 'd');

    it('puts the head-to-head winner first by default', () => {
      const rows = rankStandings(t, games, results);
      expect(rows[0].points).toBe(rows[1].points);
      expect(order(rows).slice(0, 2)).toEqual(['a', 'b']);
    });

    it('puts the better difference first when difference comes first', () => {
      const rows = rankStandings(t, games, results, 'difference_first');
      expect(order(rows).slice(0, 2)).toEqual(['b', 'a']);
    });
  });

  it('ranks a three-way cycle the same whatever order the teams arrive in', () => {
    // a beat b, b beat c, c beat a, all 1-0, so they are level on everything.
    // Their mini-league is level too, so the order falls to overall difference
    // (the three have different margins against d) and is the same every time.
    const { games, results } = league([
      ['a', 'b', 1, 0],
      ['b', 'c', 1, 0],
      ['c', 'a', 1, 0],
      ['a', 'd', 3, 0],
      ['b', 'd', 2, 0],
      ['c', 'd', 1, 0],
    ]);
    const base = order(rankStandings(teams('a', 'b', 'c', 'd'), games, results));
    expect(base).toEqual(['a', 'b', 'c', 'd']);

    const permutations = [
      ['d', 'c', 'b', 'a'],
      ['b', 'd', 'a', 'c'],
      ['c', 'a', 'd', 'b'],
      ['a', 'c', 'b', 'd'],
    ];
    for (const p of permutations) {
      expect(order(rankStandings(teams(...p), [...games].reverse(), results))).toEqual(base);
    }
  });

  it('applies head-to-head, then difference, to a cluster it only partly splits', () => {
    // a, b and c all finish on 6 points. In their mini-league a beat both and
    // b and c drew, so a is first and b and c stay tied until difference.
    const { games, results } = league([
      ['a', 'b', 1, 0],
      ['a', 'c', 1, 0],
      ['b', 'c', 0, 0],
      ['b', 'f1', 5, 0],
      ['c', 'f1', 1, 0],
      ['b', 'f2', 0, 0],
      ['c', 'f2', 0, 0],
      ['b', 'f3', 0, 0],
      ['c', 'f3', 0, 0],
    ]);
    const t = teams('a', 'b', 'c', 'f1', 'f2', 'f3');
    const rows = rankStandings(t, games, results);
    expect(rows.slice(0, 3).map((r) => r.points)).toEqual([6, 6, 6]);
    expect(order(rows).slice(0, 3)).toEqual(['a', 'b', 'c']);

    // With difference first the order is just by margin: b +5, a +2, c +1.
    const byDifference = rankStandings(t, games, results, 'difference_first');
    expect(order(byDifference).slice(0, 3)).toEqual(['b', 'a', 'c']);
  });

  it('falls back to goals scored, then to team name, for a complete tie', () => {
    const scoredFirst = league([
      ['a', 'b', 2, 2],
      ['a', 'c', 0, 0],
      ['b', 'c', 0, 0],
    ]);
    // a: 2 scored, b: 2 scored, c: 0 scored; all 2 points, difference 0.
    const rows = rankStandings(teams('a', 'b', 'c'), scoredFirst.games, scoredFirst.results);
    expect(order(rows)).toEqual(['a', 'b', 'c']);

    const allLevel = rankStandings([team('x', 'Zebras'), team('y', 'Aardvarks')], [], []);
    expect(order(allLevel)).toEqual(['y', 'x']);
  });

  it('ranks groups independently when given only that group', () => {
    const { games, results } = league([
      ['a', 'b', 1, 0],
      ['c', 'd', 0, 2],
    ]);
    const groupA = rankStandings(teams('a', 'b'), games, results);
    expect(order(groupA)).toEqual(['a', 'b']);
    expect(groupA.every((r) => r.played === 1)).toBe(true);
  });
});

describe('finalPlaces', () => {
  it('places a league by its table', () => {
    const places = finalPlaces({ format: 'league', table: [{ teamId: 'a' }, { teamId: 'b' }, { teamId: 'c' }] });
    expect(places).toEqual([
      { teamId: 'a', place: 1 },
      { teamId: 'b', place: 2 },
      { teamId: 'c', place: 3 },
    ]);
  });

  it('places a knockout from the games that ended each run', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const games = generateBracket({ seeds, shape: 'split' });
    // Higher seed always wins.
    const rank = (id: string) => Number(id.slice(1));
    const teamsAt = new Map(games.map((g) => [g.key, { home: g.home, away: g.away }]));
    const outcomes = [...games]
      .sort((a, b) => a.round - b.round)
      .map((g) => {
        const { home, away } = teamsAt.get(g.key)!;
        const [winner, loser] = rank(home!) < rank(away!) ? [home!, away!] : [away!, home!];
        if (g.winnerTo) teamsAt.get(g.winnerTo.key)![g.winnerTo.slot] = winner;
        if (g.loserTo) teamsAt.get(g.loserTo.key)![g.loserTo.slot] = loser;
        return { winnerPlace: g.winnerPlace, loserPlace: g.loserPlace, winnerTeamId: winner, loserTeamId: loser };
      });
    const places = finalPlaces({ format: 'league_knockout', outcomes });
    expect(places.map((p) => p.teamId)).toEqual(seeds);
  });

  it('throws when places are missing or repeated', () => {
    expect(() =>
      finalPlaces({
        format: 'knockout',
        outcomes: [{ winnerPlace: 1, loserPlace: 3, winnerTeamId: 'a', loserTeamId: 'b' }],
      })
    ).toThrow(/incomplete/);
    expect(() =>
      finalPlaces({
        format: 'knockout',
        outcomes: [{ winnerPlace: 1, loserPlace: 2, winnerTeamId: null, loserTeamId: 'b' }],
      })
    ).toThrow(/no winner/);
  });
});
