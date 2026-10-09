import { generateBracket, type BracketShape, type PlanGame } from './bracket';
import { generateLeague } from './fixtures';
import { seededRng } from './rng';
import type { GameRecord, ResultRecord, TeamRecord } from './types';
import {
  bracketSections,
  buildSchedule,
  dayNote,
  defaultDir,
  exitText,
  gameMeta,
  gameState,
  gameView,
  jumpTargets,
  nextUpIds,
  placeRows,
  record,
  sortRows,
  sourceText,
  standingsView,
} from './view';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const teamIds = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const teamMap = (n: number) =>
  new Map<string, TeamRecord>(
    teamIds(n).map((id) => [id, { id, name: `Team ${id.slice(1)}`, division: 'juniors' as const }])
  );

function game(over: Partial<GameRecord> & { id: string }): GameRecord {
  return {
    sport_block_id: 'b1',
    home_team_id: null,
    away_team_id: null,
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

function result(gameId: string, home: number, away: number, winner: string | null, tiebreak: string | null = null): ResultRecord {
  return {
    game_id: gameId,
    home_total: home,
    away_total: away,
    winner_team_id: winner,
    tiebreak_winner_team_id: tiebreak,
    recorded_by: null,
    recorded_at: '2026-10-19T16:00:00Z',
    details: {},
  };
}

/** A generated bracket as the database stores it: keys become ids. */
function fromPlan(plan: readonly PlanGame[]): GameRecord[] {
  return plan.map((p) =>
    game({
      id: p.key,
      stage: p.stage,
      round: p.round,
      label: p.label,
      home_team_id: p.home,
      away_team_id: p.away,
      winner_to_game_id: p.winnerTo?.key ?? null,
      winner_to_slot: p.winnerTo?.slot ?? null,
      loser_to_game_id: p.loserTo?.key ?? null,
      loser_to_slot: p.loserTo?.slot ?? null,
      winner_place: p.winnerPlace ?? null,
      loser_place: p.loserPlace ?? null,
    })
  );
}

/** What record_game_result() does: store the result and move both teams on. */
function playGame(
  games: GameRecord[],
  results: Map<string, ResultRecord>,
  id: string,
  home: number,
  away: number,
  tiebreak: 'home' | 'away' | null = null
) {
  const g = games.find((x) => x.id === id)!;
  const winnerSide = home > away ? 'home' : away > home ? 'away' : tiebreak!;
  const winner = winnerSide === 'home' ? g.home_team_id : g.away_team_id;
  const loser = winnerSide === 'home' ? g.away_team_id : g.home_team_id;
  results.set(id, result(id, home, away, winner, home === away ? winner : null));
  g.status = 'completed';
  const put = (to: string | null, slot: 'home' | 'away' | null, team: string | null) => {
    if (!to || !slot) return;
    const target = games.find((x) => x.id === to)!;
    if (slot === 'home') target.home_team_id = team;
    else target.away_team_id = team;
  };
  put(g.winner_to_game_id, g.winner_to_slot, winner);
  put(g.loser_to_game_id, g.loser_to_slot, loser);
}

/** Plays every playable game, the home side winning 2-1, until none is left. */
function playOut(games: GameRecord[], results: Map<string, ResultRecord>) {
  for (let i = 0; i < 40; i++) {
    const next = games.find((g) => g.status === 'scheduled' && g.home_team_id && g.away_team_id);
    if (!next) return;
    playGame(games, results, next.id, 2, 1);
  }
}

const noResults = new Map<string, ResultRecord>();

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

describe('which game is next up', () => {
  const ready = (id: string, date: string | null, time: string | null, extra: Partial<GameRecord> = {}) =>
    game({ id, home_team_id: 'a', away_team_id: 'b', scheduled_date: date, scheduled_time: time, ...extra });

  it('is every unplayed game in the earliest slot that has one', () => {
    const games = [
      ready('done', '2026-10-12', '09:00:00', { status: 'completed' }),
      ready('c1', '2026-10-12', '11:15:00', { court: 1 }),
      ready('c2', '2026-10-12', '11:15:00', { court: 2 }),
      ready('later', '2026-10-12', '12:00:00'),
      ready('nextday', '2026-10-19', '09:00:00'),
    ];
    expect([...nextUpIds(games)].sort()).toEqual(['c1', 'c2']);
  });

  it('skips games waiting on a team, and games with no time', () => {
    const games = [
      game({ id: 'waiting', home_team_id: 'a', away_team_id: null, scheduled_date: '2026-10-12', scheduled_time: '08:00:00' }),
      ready('unscheduled', null, null),
      ready('real', '2026-10-12', '10:00:00'),
    ];
    expect([...nextUpIds(games)]).toEqual(['real']);
  });

  it('is empty when nothing is ready', () => {
    expect(nextUpIds([])).toEqual(new Set());
    expect(nextUpIds([ready('done', '2026-10-12', '09:00:00', { status: 'completed' })])).toEqual(new Set());
  });

  it('names the four states', () => {
    const next = new Set(['n']);
    expect(gameState(ready('p', '2026-10-12', '09:00:00', { status: 'completed' }), next)).toBe('final');
    expect(gameState(ready('n', '2026-10-12', '09:00:00'), next)).toBe('next');
    expect(gameState(ready('u', '2026-10-12', '10:00:00'), next)).toBe('upcoming');
    expect(gameState(game({ id: 'w', home_team_id: 'a' }), next)).toBe('waiting');
  });
});

describe('where a waiting team comes from', () => {
  const semi = game({ id: 'sf1', label: 'Semi-final 1', winner_to_game_id: 'f', winner_to_slot: 'home', loser_to_game_id: 'p3', loser_to_slot: 'home' });
  const final = game({ id: 'f', label: 'Final' });
  const third = game({ id: 'p3', label: '3rd place' });
  const all = [semi, final, third];

  it('says winner of or loser of the game that feeds the slot', () => {
    expect(sourceText(final, 'home', all)).toBe('Winner of Semi-final 1');
    expect(sourceText(third, 'home', all)).toBe('Loser of Semi-final 1');
  });

  it('falls back when nothing feeds it', () => {
    expect(sourceText(final, 'away', all)).toBe('To be decided');
  });
});

describe('a game as a screen shows it', () => {
  const teams = teamMap(4);
  const base = game({ id: 'g', home_team_id: 't1', away_team_id: 't2', status: 'completed', scheduled_date: '2026-10-12' });
  const ctx = (results: Map<string, ResultRecord>, sport = 'soccer', games: GameRecord[] = [base]) => ({
    sport,
    teams,
    games,
    results,
    next: new Set<string>(),
  });

  it('marks the winner and the loser of a played game', () => {
    const v = gameView(base, ctx(new Map([['g', result('g', 2, 0, 't1')]])));
    expect(v.home).toEqual({ name: 'Team 1', score: 2, tone: 'win' });
    expect(v.away).toEqual({ name: 'Team 2', score: 0, tone: 'loss' });
    expect(v.state).toBe('final');
    expect(v.draw).toBe(false);
  });

  it('treats a draw as neutral on both sides and says so in the meta line', () => {
    const v = gameView(base, ctx(new Map([['g', result('g', 1, 1, null)]])));
    expect(v.home.tone).toBe('neutral');
    expect(v.away.tone).toBe('neutral');
    expect(v.draw).toBe(true);
    expect(gameMeta('soccer', v)).toBe('Soccer · Round 1 · draw');
  });

  it('shows no score for a game not yet played', () => {
    const upcoming = game({ id: 'u', home_team_id: 't1', away_team_id: 't2' });
    const v = gameView(upcoming, ctx(noResults, 'soccer', [upcoming]));
    expect(v.home).toEqual({ name: 'Team 1', score: null, tone: 'neutral' });
    expect(v.state).toBe('upcoming');
  });

  it('shows where a missing team comes from', () => {
    const feeder = game({ id: 'sf', label: 'Semi-final 1', winner_to_game_id: 'f', winner_to_slot: 'away' });
    const final = game({ id: 'f', label: 'Final', home_team_id: 't1' });
    const v = gameView(final, ctx(noResults, 'soccer', [feeder, final]));
    expect(v.away).toEqual({ name: 'Winner of Semi-final 1', score: null, tone: 'waiting' });
    expect(v.state).toBe('waiting');
  });

  it('explains a level knockout game in the words of its sport', () => {
    const ko = game({ id: 'k', stage: 'knockout', home_team_id: 't1', away_team_id: 't2', status: 'completed' });
    const r = new Map([['k', result('k', 2, 2, 't2', 't2')]]);
    expect(gameView(ko, ctx(r, 'soccer', [ko])).tiebreakNote).toBe('Level, Team 2 won on penalties');
    expect(gameView(ko, ctx(r, 'basketball', [ko])).tiebreakNote).toBe('Level, Team 2 won in overtime');
    expect(gameView(base, ctx(new Map([['g', result('g', 2, 0, 't1')]]))).tiebreakNote).toBeNull();
  });

  it('copes with a team id it does not know', () => {
    const odd = game({ id: 'o', home_team_id: 'ghost', away_team_id: 't2' });
    expect(gameView(odd, ctx(noResults, 'soccer', [odd])).home.name).toBe('Unknown team');
  });
});

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

describe('the schedule', () => {
  const at = (id: string, date: string | null, time: string | null, court: number | null, home = 'a', away = 'b') =>
    game({ id, scheduled_date: date, scheduled_time: time, court, home_team_id: home, away_team_id: away });

  const games = [
    at('late', '2026-10-19', '09:00:00', 1),
    at('c2', '2026-10-12', '09:00:00', 2, 'c', 'd'),
    at('c1', '2026-10-12', '09:00:00', 1),
    at('noon', '2026-10-12', '12:00:00', 1, 'a', 'c'),
    at('none', null, null, null),
  ];

  it('groups by day, then time, then court, and leaves unscheduled games off', () => {
    const days = buildSchedule(games);
    expect(days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-19']);
    expect(days[0].slots.map((s) => s.time)).toEqual(['09:00:00', '12:00:00']);
    expect(days[0].slots[0].games.map((g) => g.id)).toEqual(['c1', 'c2']);
    expect(days.flatMap((d) => d.slots.flatMap((s) => s.games)).map((g) => g.id)).not.toContain('none');
  });

  it('counts slots, courts and games for the day heading', () => {
    const [first] = buildSchedule(games);
    expect(first).toMatchObject({ count: 3, courts: 2 });
    expect(dayNote(first, false)).toBe('2 slots · 2 courts');
    expect(dayNote({ ...first, count: 1 }, true)).toBe('1 game');
    expect(dayNote(first, true)).toBe('3 games');
  });

  it('shows one team only the games it is known to play in', () => {
    const days = buildSchedule(games, { teamIds: new Set(['c']) });
    expect(days.flatMap((d) => d.slots.flatMap((s) => s.games)).map((g) => g.id).sort()).toEqual(['c2', 'noon']);
  });

  it('keeps a knockout game off a team schedule until the team is known', () => {
    const waiting = game({ id: 'w', scheduled_date: '2026-10-19', scheduled_time: '10:00:00', court: 1, home_team_id: 'a', away_team_id: null });
    expect(buildSchedule([waiting], { teamIds: new Set(['b']) })).toEqual([]);
    expect(buildSchedule([waiting], { teamIds: new Set(['a']) })).toHaveLength(1);
  });

  it('puts a game with no time after the timed ones', () => {
    const days = buildSchedule([at('t', '2026-10-12', null, 1), at('x', '2026-10-12', '09:00:00', 1)]);
    expect(days[0].slots.map((s) => s.time)).toEqual(['09:00:00', null]);
  });

  it('is empty when nothing is scheduled', () => {
    expect(buildSchedule([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

describe('standings', () => {
  const teams = teamMap(8);

  function leagueGames(structure: 'round_robin' | 'groups', n = 8) {
    const league = generateLeague(teamIds(n), structure, seededRng(7));
    return league.fixtures.map((f, i) =>
      game({
        id: `g${i}`,
        home_team_id: f.home,
        away_team_id: f.away,
        round: f.round,
        group_label: f.group,
        label: `Round ${f.round}`,
      })
    );
  }

  /** Lower-numbered team always wins 1-0. */
  function playRounds(games: GameRecord[], upToRound: number) {
    const results = new Map<string, ResultRecord>();
    for (const g of games) {
      if (g.round > upToRound) continue;
      const homeWins = Number(g.home_team_id!.slice(1)) < Number(g.away_team_id!.slice(1));
      results.set(g.id, result(g.id, homeWins ? 1 : 0, homeWins ? 0 : 1, homeWins ? g.home_team_id : g.away_team_id));
      g.status = 'completed';
    }
    return results;
  }

  it('says not started, with teams A to Z, before a game is played', () => {
    const games = leagueGames('round_robin');
    const view = standingsView({ league_structure: 'round_robin' }, teams, games, noResults)!;
    expect(view.started).toBe(false);
    expect(view.chip).toBe('League · not started');
    expect(view.tables).toHaveLength(1);
    expect(view.tables[0].rows.map((r) => r.name)).toEqual(Array.from({ length: 8 }, (_, i) => `Team ${i + 1}`));
  });

  it('shows the round under way, and ranks by the library', () => {
    const games = leagueGames('round_robin');
    const results = playRounds(games, 3);
    const view = standingsView({ league_structure: 'round_robin' }, teams, games, results)!;
    expect(view.started).toBe(true);
    expect(view.chip).toBe('League · round 4 of 7');
    expect(view.played).toBe(12);
    expect(view.total).toBe(28);
    expect(view.tables[0].rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(view.tables[0].rows[0].name).toBe('Team 1');
  });

  it('says complete once every game is played', () => {
    const games = leagueGames('round_robin');
    const results = playRounds(games, 7);
    expect(standingsView({ league_structure: 'round_robin' }, teams, games, results)!.chip).toBe('League · complete');
  });

  it('makes a table per group, each with its own leader', () => {
    const games = leagueGames('groups');
    const results = playRounds(games, 2);
    const view = standingsView({ league_structure: 'groups' }, teams, games, results)!;
    expect(view.tables.map((t) => t.group)).toEqual(['A', 'B']);
    expect(view.tables.every((t) => t.rows.length === 4)).toBe(true);
    expect(view.tables.every((t) => t.rows[0].rank === 1)).toBe(true);
    expect(view.chip).toBe('Groups · round 3 of 3');
    expect(new Set(view.tables.flatMap((t) => t.rows.map((r) => r.teamId))).size).toBe(8);
  });

  it('handles groups of four and three', () => {
    const view = standingsView({ league_structure: 'groups' }, teamMap(7), leagueGames('groups', 7), noResults)!;
    expect(view.tables.map((t) => t.rows.length).sort()).toEqual([3, 4]);
  });

  it('has nothing to rank for a knockout-only block', () => {
    const ko = fromPlan(generateBracket({ seeds: teamIds(8), shape: 'full' }));
    expect(standingsView({ league_structure: null }, teams, ko, noResults)).toBeNull();
  });

  describe('sorting a table', () => {
    const rows = standingsView(
      { league_structure: 'round_robin' },
      teams,
      leagueGames('round_robin'),
      playRounds(leagueGames('round_robin'), 7)
    )!.tables[0].rows;

    it('never changes anyone rank', () => {
      for (const key of ['team', 'played', 'record', 'difference', 'scored', 'points'] as const) {
        for (const dir of ['asc', 'desc'] as const) {
          const sorted = sortRows(rows, key, dir);
          for (const r of sorted) expect(r.rank).toBe(rows.find((x) => x.teamId === r.teamId)!.rank);
        }
      }
    });

    it('sorts by name A to Z and back', () => {
      expect(sortRows(rows, 'team', 'asc').map((r) => r.name)[0]).toBe('Team 1');
      expect(sortRows(rows, 'team', 'desc').map((r) => r.name)[0]).toBe('Team 8');
    });

    it('sorts by points, high to low by default', () => {
      expect(defaultDir('points')).toBe('desc');
      expect(defaultDir('team')).toBe('asc');
      const pts = sortRows(rows, 'points', 'desc').map((r) => r.points);
      expect(pts).toEqual([...pts].sort((a, b) => b - a));
    });

    it('breaks a tie in a sorted column by rank', () => {
      const tied = rows.map((r) => ({ ...r, played: 7 }));
      expect(sortRows(tied, 'played', 'desc').map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('does not mutate its input', () => {
      const copy = [...rows];
      sortRows(rows, 'team', 'desc');
      expect(rows).toEqual(copy);
    });
  });

  it('writes a record with en dashes', () => {
    expect(record({ won: 3, drawn: 0, lost: 1 })).toBe('3–0–1');
  });
});

// ---------------------------------------------------------------------------
// The bracket
// ---------------------------------------------------------------------------

describe('the bracket', () => {
  const block = { sport: 'soccer' };

  const sectionsFor = (shape: BracketShape, n: number) =>
    bracketSections(block, teamMap(n), fromPlan(generateBracket({ seeds: teamIds(n), shape })), noResults);

  const cases: [BracketShape, number][] = [6, 7, 8].flatMap((n) => [
    ['full', n] as [BracketShape, number],
    ['split', n] as [BracketShape, number],
  ]);

  it.each(cases)('puts every %s game of %i teams in exactly one section', (shape, n) => {
    const plan = generateBracket({ seeds: teamIds(n), shape });
    const sections = sectionsFor(shape, n);
    const ids = sections.flatMap((s) => s.items.flatMap((i) => (i.kind === 'game' ? [i.game.id] : [])));
    expect(ids.sort()).toEqual(plan.map((p) => p.key).sort());
    expect(sections.map((s) => s.id)).toEqual([...new Set(sections.map((s) => s.id))]);
    for (const s of sections) expect(s.total).toBe(s.items.filter((i) => i.kind === 'game').length);
  });

  it('lays out eight teams as quarters, semis, final and 3rd, then placement games', () => {
    const s = sectionsFor('full', 8);
    expect(s.map((x) => [x.id, x.title, x.total])).toEqual([
      ['quarters', 'Quarter-finals', 4],
      ['semis', 'Semi-finals', 2],
      ['final', 'Final and 3rd place', 2],
      ['places', 'Placement games', 4],
    ]);
    const finalLabels = s[2].items.flatMap((i) => (i.kind === 'game' ? [i.game.label] : []));
    expect(finalLabels).toEqual(['Final', '3rd place']);
    expect(s.flatMap((x) => x.items).some((i) => i.kind === 'bye')).toBe(false);
  });

  it('folds the placement games in with the final for six and seven teams', () => {
    for (const n of [6, 7]) {
      const s = sectionsFor('full', n);
      expect(s.map((x) => x.id)).toEqual(['quarters', 'semis', 'final']);
      expect(s[2].title).toBe('Final and places');
    }
    const six = sectionsFor('full', 6)[2].items.flatMap((i) => (i.kind === 'game' ? [i.game.label] : []));
    expect(six).toEqual(['Final', '3rd place', '5th place']);
    const seven = sectionsFor('full', 7)[2].items.flatMap((i) => (i.kind === 'game' ? [i.game.label] : []));
    expect(seven).toEqual(['Final', '3rd place', '6th-7th game', '5th place']);
  });

  it('shows the seeded-through teams as byes in the round they skip', () => {
    const six = sectionsFor('full', 6);
    const byes = six[0].items.filter((i) => i.kind === 'bye');
    expect(byes).toEqual([
      { kind: 'bye', team: 'Team 1', goesTo: 'Semi-final 1' },
      { kind: 'bye', team: 'Team 2', goesTo: 'Semi-final 2' },
    ]);
    expect(six[0].items.slice(0, 2).every((i) => i.kind === 'bye')).toBe(true);

    const seven = sectionsFor('full', 7);
    expect(seven[0].items.filter((i) => i.kind === 'bye')).toEqual([{ kind: 'bye', team: 'Team 1', goesTo: 'Semi-final 1' }]);
    // The count of byes is the count of seeded slots in later rounds, nothing more.
    expect(sectionsFor('full', 8).flatMap((x) => x.items).filter((i) => i.kind === 'bye')).toHaveLength(0);
  });

  it('starts a league-then-knockout bracket at the semi-finals', () => {
    const s = sectionsFor('split', 8);
    expect(s.map((x) => x.id)).toEqual(['semis', 'final', 'places']);
    expect(sectionsFor('split', 6).map((x) => x.id)).toEqual(['semis', 'final']);
  });

  it('offers a jump chip for each section that exists', () => {
    expect(jumpTargets(sectionsFor('full', 8)).map((j) => j.label)).toEqual(['Quarters', 'Semis', 'Final', 'Places']);
    expect(jumpTargets(sectionsFor('full', 6)).map((j) => j.label)).toEqual(['Quarters', 'Semis', 'Final']);
  });

  it('has no sections before a bracket exists', () => {
    expect(bracketSections(block, teamMap(8), [game({ id: 'l', stage: 'league' })], noResults)).toEqual([]);
  });

  describe('what happens to the winner and the loser', () => {
    const games = fromPlan(generateBracket({ seeds: teamIds(8), shape: 'full' }));
    const byLabel = (label: string) => games.find((g) => g.label === label)!;

    it('says where each goes', () => {
      expect(exitText(byLabel('Quarter-final 1'), games)).toBe(
        'Winner plays Semi-final 1 · loser plays 5th-8th semi-final 1'
      );
      expect(exitText(byLabel('Semi-final 1'), games)).toBe('Winner plays the final · loser plays 3rd place');
    });

    it('says which places a deciding game settles', () => {
      expect(exitText(byLabel('Final'), games)).toBe('Decides 1st and 2nd');
      expect(exitText(byLabel('3rd place'), games)).toBe('Decides 3rd and 4th');
      expect(exitText(byLabel('7th place'), games)).toBe('Decides 7th and 8th');
    });

    it('says when only the loser is placed', () => {
      const seven = fromPlan(generateBracket({ seeds: teamIds(7), shape: 'full' }));
      const ps1 = seven.find((g) => g.label === '6th-7th game')!;
      expect(exitText(ps1, seven)).toBe('Winner plays 5th place · loser takes 7th');
    });
  });

  it('shows waiting teams, scores, and where a game is', () => {
    const plan = generateBracket({ seeds: teamIds(8), shape: 'full' });
    const games = fromPlan(plan);
    const results = new Map<string, ResultRecord>();
    games.find((g) => g.id === 'QF1')!.scheduled_date = '2026-10-19';
    games.find((g) => g.id === 'QF1')!.scheduled_time = '09:00:00';
    games.find((g) => g.id === 'QF1')!.court = 1;
    playGame(games, results, 'QF1', 3, 0);

    const sections = bracketSections(block, teamMap(8), games, results);
    const qf1 = sections[0].items.find((i) => i.kind === 'game' && i.game.id === 'QF1');
    expect(qf1).toMatchObject({
      game: { when: 'Oct 19 · 9:00 · Court 1', state: 'final', home: { name: 'Team 1', score: 3, tone: 'win' } },
    });
    expect(sections[0].played).toBe(1);

    const sf1 = sections[1].items.find((i) => i.kind === 'game' && i.game.id === 'SF1');
    expect(sf1).toMatchObject({ game: { home: { name: 'Team 1', tone: 'neutral' }, away: { name: 'Winner of Quarter-final 2', tone: 'waiting' }, state: 'waiting' } });
  });
});

// ---------------------------------------------------------------------------
// Final places
// ---------------------------------------------------------------------------

describe('final places', () => {
  it('describes how every team earned its place in a knockout', () => {
    const teams = teamMap(8);
    const games = fromPlan(generateBracket({ seeds: teamIds(8), shape: 'full' }));
    const results = new Map<string, ResultRecord>();
    // Play everything, home winning 2-1, except the 7th-place game, which goes to penalties.
    for (let i = 0; i < 40; i++) {
      const next = games.find((g) => g.status === 'scheduled' && g.home_team_id && g.away_team_id);
      if (!next) break;
      if (next.label === '7th place') playGame(games, results, next.id, 1, 1, 'away');
      else playGame(games, results, next.id, 2, 1);
    }

    const places = [1, 2, 3, 4, 5, 6, 7, 8].map((place) => {
      const g = games.find((x) => x.winner_place === place || x.loser_place === place)!;
      const r = results.get(g.id)!;
      const winnerIsHome = r.winner_team_id === g.home_team_id;
      const loser = winnerIsHome ? g.away_team_id : g.home_team_id;
      return { sport_block_id: 'b1', place, team_id: g.winner_place === place ? r.winner_team_id! : loser! };
    });

    const rows = placeRows({ sport: 'soccer', format: 'knockout', league_structure: null }, teams, places, games, results);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows[0].how).toMatch(/^Won the final, 2–1 over Team \d$/);
    expect(rows[1].how).toBe('Lost the final');
    expect(rows[2].how).toMatch(/^Won 3rd place, 2–1 over Team \d$/);
    expect(rows[3].how).toBe('Lost 3rd place');
    expect(rows[4].how).toMatch(/^Won 5th place, 2–1 over Team \d$/);
    expect(rows[5].how).toBe('Lost 5th place');
    expect(rows[6].how).toMatch(/^Won 7th place on penalties, 1–1 over Team \d$/);
    expect(rows[7].how).toBe('Lost 7th place');
    expect(new Set(rows.map((r) => r.team)).size).toBe(8);
  });

  it('names the 6th-7th game for the team that takes 7th', () => {
    const teams = teamMap(7);
    const games = fromPlan(generateBracket({ seeds: teamIds(7), shape: 'full' }));
    const results = new Map<string, ResultRecord>();
    playOut(games, results);
    const ps1 = games.find((g) => g.label === '6th-7th game')!;
    const r = results.get(ps1.id)!;
    const seventh = r.winner_team_id === ps1.home_team_id ? ps1.away_team_id! : ps1.home_team_id!;
    const rows = placeRows(
      { sport: 'soccer', format: 'knockout', league_structure: null },
      teams,
      [{ sport_block_id: 'b1', place: 7, team_id: seventh }],
      games,
      results
    );
    expect(rows[0].how).toBe('Lost the 6th-7th game');
  });

  it('describes a league place by the team record', () => {
    const teams = teamMap(6);
    const league = generateLeague(teamIds(6), 'round_robin', seededRng(2));
    const games = league.fixtures.map((f, i) =>
      game({ id: `g${i}`, home_team_id: f.home, away_team_id: f.away, round: f.round, status: 'completed' })
    );
    const results = new Map(
      games.map((g) => {
        const homeWins = Number(g.home_team_id!.slice(1)) < Number(g.away_team_id!.slice(1));
        return [g.id, result(g.id, homeWins ? 1 : 0, homeWins ? 0 : 1, homeWins ? g.home_team_id : g.away_team_id)];
      })
    );
    const rows = placeRows(
      { sport: 'soccer', format: 'league', league_structure: 'round_robin' },
      teams,
      [{ sport_block_id: 'b1', place: 1, team_id: 't1' }],
      games,
      results
    );
    expect(rows[0]).toEqual({ place: 1, team: 'Team 1', how: '5 games · 5–0–0 · 15 points' });
  });

  it('leaves the description empty rather than guessing when the game is missing', () => {
    const rows = placeRows(
      { sport: 'soccer', format: 'knockout', league_structure: null },
      teamMap(6),
      [{ sport_block_id: 'b1', place: 1, team_id: 't1' }],
      [],
      noResults
    );
    expect(rows).toEqual([{ place: 1, team: 'Team 1', how: '' }]);
  });
});
