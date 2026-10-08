import type { Pool, PoolClient } from 'pg';
import { makePool, withTx, asUser, createProfile, grantRole } from './helpers';

/**
 * Sports competition schema and RPCs (ENG-12), exercised the way Postgres
 * evaluates them for a signed-in request (see helpers.ts).
 *
 * Covered: who may read and write (project_spec.md 1.5), that games and results
 * are reachable only through the functions, the knockout graph (including the
 * prototype's bugs: the 5th-place winner reaching the Final, the 5th-8th bracket
 * never filling, edits that did not un-advance a team), tiebreaks, and block
 * completion.
 *
 * Bracket fixtures here are hand-written graphs in the shape the generator in
 * src/lib/competition/bracket.ts (ENG-13) will produce; the database does not
 * care who built the graph, only that it is valid.
 */

let pool: Pool;
beforeAll(() => {
  pool = makePool();
});
afterAll(async () => {
  await pool.end();
});

type Division = 'juniors' | 'ambassadors';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function currentSeason(client: PoolClient): Promise<string> {
  const r = await client.query('select id from seasons where is_current limit 1');
  if (r.rows[0]) return r.rows[0].id;
  return (
    await client.query(
      `insert into seasons (name, is_current, starts_on) values ('Test season', true, '2026-09-01') returning id`
    )
  ).rows[0].id;
}

async function seedTeams(client: PoolClient, n: number, division: Division = 'juniors'): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    ids.push(
      (await client.query(`insert into ministry_teams (name, division) values ($1, $2) returning id`, [
        `T${i}-${division}`,
        division,
      ])).rows[0].id
    );
  }
  return ids;
}

async function seedBlock(
  client: PoolClient,
  opts: { format?: string; structure?: string | null; division?: Division; sport?: string } = {}
): Promise<string> {
  const season = await currentSeason(client);
  const format = opts.format ?? 'league';
  const structure = opts.structure === undefined ? (format === 'knockout' ? null : 'round_robin') : opts.structure;
  return (
    await client.query(
      `insert into sport_blocks (season_id, division, sport, format, league_structure)
       values ($1, $2, $3, $4, $5) returning id`,
      [season, opts.division ?? 'juniors', opts.sport ?? 'soccer', format, structure]
    )
  ).rows[0].id;
}

async function userWithRole(client: PoolClient, role: string, tag = role): Promise<string> {
  const id = await createProfile(client, { email: `${tag}-${Math.random().toString(36).slice(2)}@test.local` });
  await grantRole(client, id, role);
  return id;
}

type Edge = [string, 'home' | 'away'];
interface G {
  key: string;
  stage: 'league' | 'knockout' | 'placement';
  round: number;
  label: string;
  home_team_id?: string | null;
  away_team_id?: string | null;
  winner_to?: { key: string; slot: string };
  loser_to?: { key: string; slot: string };
  winner_place?: number;
  loser_place?: number;
}

const edge = (e?: Edge) => (e ? { key: e[0], slot: e[1] } : undefined);
function g(
  key: string,
  stage: G['stage'],
  round: number,
  o: { home?: string | null; away?: string | null; wt?: Edge; lt?: Edge; wp?: number; lp?: number } = {}
): G {
  return {
    key,
    stage,
    round,
    label: key,
    home_team_id: o.home ?? null,
    away_team_id: o.away ?? null,
    winner_to: edge(o.wt),
    loser_to: edge(o.lt),
    winner_place: o.wp,
    loser_place: o.lp,
  };
}

function roundRobin(teams: string[]): G[] {
  const out: G[] = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      out.push(g(`L${i}-${j}`, 'league', 1, { home: teams[i], away: teams[j] }));
  return out;
}

/** Seeds 1..6, byes for 1 and 2, QF losers play for 5th/6th. */
function bracket6Full(t: string[]): G[] {
  return [
    g('q1', 'knockout', 1, { home: t[3], away: t[4], wt: ['sf1', 'away'], lt: ['p5', 'home'] }),
    g('q2', 'knockout', 1, { home: t[2], away: t[5], wt: ['sf2', 'away'], lt: ['p5', 'away'] }),
    g('sf1', 'knockout', 2, { home: t[0], wt: ['f', 'home'], lt: ['third', 'home'] }),
    g('sf2', 'knockout', 2, { home: t[1], wt: ['f', 'away'], lt: ['third', 'away'] }),
    g('p5', 'placement', 2, { wp: 5, lp: 6 }),
    g('f', 'knockout', 3, { wp: 1, lp: 2 }),
    g('third', 'placement', 3, { wp: 3, lp: 4 }),
  ];
}

/** Seeds 1..8, quarter-finals, then both a championship and a 5th-8th bracket. */
function bracket8Full(t: string[]): G[] {
  return [
    g('q1', 'knockout', 1, { home: t[0], away: t[7], wt: ['sf1', 'home'], lt: ['ps1', 'home'] }),
    g('q2', 'knockout', 1, { home: t[3], away: t[4], wt: ['sf1', 'away'], lt: ['ps1', 'away'] }),
    g('q3', 'knockout', 1, { home: t[1], away: t[6], wt: ['sf2', 'home'], lt: ['ps2', 'home'] }),
    g('q4', 'knockout', 1, { home: t[2], away: t[5], wt: ['sf2', 'away'], lt: ['ps2', 'away'] }),
    g('sf1', 'knockout', 2, { wt: ['f', 'home'], lt: ['third', 'home'] }),
    g('sf2', 'knockout', 2, { wt: ['f', 'away'], lt: ['third', 'away'] }),
    g('ps1', 'placement', 2, { wt: ['p5', 'home'], lt: ['p7', 'home'] }),
    g('ps2', 'placement', 2, { wt: ['p5', 'away'], lt: ['p7', 'away'] }),
    g('f', 'knockout', 3, { wp: 1, lp: 2 }),
    g('third', 'placement', 3, { wp: 3, lp: 4 }),
    g('p5', 'placement', 3, { wp: 5, lp: 6 }),
    g('p7', 'placement', 3, { wp: 7, lp: 8 }),
  ];
}

/** 6 teams, league then knockout: semis 1v4, 2v3, plus a 5v6 game. */
function knockout6Split(t: string[]): G[] {
  return [
    g('sf1', 'knockout', 1, { home: t[0], away: t[3], wt: ['f', 'home'], lt: ['third', 'home'] }),
    g('sf2', 'knockout', 1, { home: t[1], away: t[2], wt: ['f', 'away'], lt: ['third', 'away'] }),
    g('f', 'knockout', 2, { wp: 1, lp: 2 }),
    g('third', 'placement', 2, { wp: 3, lp: 4 }),
    g('p5', 'placement', 1, { home: t[4], away: t[5], wp: 5, lp: 6 }),
  ];
}

async function createGames(client: PoolClient, as: string, block: string, games: G[]) {
  return asUser(client, as, () =>
    client.query('select public.create_sport_block_games($1, $2::jsonb) as n', [block, JSON.stringify(games)])
  );
}

async function record(
  client: PoolClient,
  as: string,
  gameId: string,
  home: number,
  away: number,
  tiebreak: string | null = null,
  details: object = {}
) {
  return asUser(client, as, () =>
    client.query('select public.record_game_result($1, $2, $3, $4, $5::jsonb)', [
      gameId,
      home,
      away,
      tiebreak,
      JSON.stringify(details),
    ])
  );
}

interface Row {
  id: string;
  label: string;
  stage: string;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
}

async function games(client: PoolClient, block: string): Promise<Record<string, Row>> {
  const rows = (
    await client.query(
      `select id, label, stage, status, home_team_id, away_team_id from games where sport_block_id = $1`,
      [block]
    )
  ).rows as Row[];
  return Object.fromEntries(rows.map((r) => [r.label, r]));
}

/** Plays every playable knockout game with the home team winning, until none is left. */
async function playOut(client: PoolClient, as: string, block: string) {
  for (let guard = 0; guard < 50; guard++) {
    const next = Object.values(await games(client, block)).find(
      (r) => r.status === 'scheduled' && r.home_team_id && r.away_team_id
    );
    if (!next) return;
    await record(client, as, next.id, 2, 1);
  }
  throw new Error('playOut did not finish');
}

async function placesOf(client: PoolClient, block: string): Promise<Record<number, string>> {
  const rows = (await client.query('select team_id, place from sport_block_places where sport_block_id = $1', [block]))
    .rows;
  return Object.fromEntries(rows.map((r) => [r.place, r.team_id]));
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code?: string }).code ?? String(e)
  );

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

describe('who can read and write', () => {
  it('lets Admin and Program Team create games, and refuses every other role', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      for (const role of ['coach', 'prayer', 'parent', 'kid']) {
        const block = await seedBlock(client, { format: 'league', sport: `s-${role}` });
        const user = await userWithRole(client, role);
        expect(await code(createGames(client, user, block, roundRobin(teams)))).toBe('42501');
      }
      for (const role of ['admin', 'program']) {
        const block = await seedBlock(client, { format: 'league', sport: `ok-${role}` });
        const user = await userWithRole(client, role);
        expect(await code(createGames(client, user, block, roundRobin(teams)))).toBe('ok');
      }
    });
  });

  it('refuses recording a result to every role that cannot update standings', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client);
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(teams));
      const game = Object.values(await games(client, block))[0];

      for (const role of ['coach', 'prayer', 'parent', 'kid']) {
        const user = await userWithRole(client, role);
        expect(await code(record(client, user, game.id, 1, 0))).toBe('42501');
      }
      expect(await code(record(client, program, game.id, 1, 0))).toBe('ok');
    });
  });

  it('refuses direct writes to games, results and places, even for an Admin', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client);
      const admin = await userWithRole(client, 'admin');
      await createGames(client, admin, block, roundRobin(teams));
      const game = Object.values(await games(client, block))[0];

      const attempts = [
        `insert into games (sport_block_id, stage, round, label) values ('${block}', 'league', 1, 'x')`,
        `update games set status = 'completed' where id = '${game.id}'`,
        `delete from games where id = '${game.id}'`,
        `insert into game_results (game_id, home_total, away_total) values ('${game.id}', 1, 0)`,
        `insert into sport_block_places (sport_block_id, team_id, place) values ('${block}', '${teams[0]}', 1)`,
      ];
      for (const sql of attempts) {
        expect(await code(asUser(client, admin, () => client.query(sql)))).toBe('42501');
      }
    });
  });

  it('lets Program Team edit a block but never set its status directly', async () => {
    await withTx(pool, async (client) => {
      const program = await userWithRole(client, 'program');
      const season = await currentSeason(client);

      await asUser(client, program, () =>
        client.query(
          `insert into sport_blocks (season_id, division, sport, format, league_structure)
           values ($1, 'juniors', 'volleyball', 'league', 'round_robin')`,
          [season]
        )
      );
      expect(
        await code(
          asUser(client, program, () =>
            client.query(
              `insert into sport_blocks (season_id, division, sport, format, league_structure, status)
               values ($1, 'juniors', 'dodgeball', 'league', 'round_robin', 'completed')`,
              [season]
            )
          )
        )
      ).toBe('42501');
      expect(
        await code(asUser(client, program, () => client.query(`update sport_blocks set status = 'completed'`)))
      ).toBe('42501');
    });
  });

  it('refuses a coach editing a block', async () => {
    await withTx(pool, async (client) => {
      const block = await seedBlock(client);
      const coach = await userWithRole(client, 'coach');
      const res = await asUser(client, coach, () =>
        client.query(`update sport_blocks set settings = '{"x":1}' where id = $1`, [block])
      );
      expect(res.rowCount).toBe(0);
    });
  });

  it('lets every role read competition data, and shows a user with no role nothing', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client);
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(teams));

      for (const role of ['admin', 'program', 'coach', 'prayer', 'parent', 'kid']) {
        const user = await userWithRole(client, role);
        const seen = await asUser(client, user, async () => ({
          blocks: (await client.query('select id from sport_blocks')).rowCount,
          games: (await client.query('select id from games')).rowCount,
          teams: (await client.query('select id from ministry_teams')).rowCount,
        }));
        expect(seen.blocks).toBeGreaterThanOrEqual(1);
        expect(seen.games).toBe(15);
        expect(seen.teams).toBeGreaterThanOrEqual(6);
      }

      const nobody = await createProfile(client, { email: 'nobody-comp@test.local' });
      const seen = await asUser(client, nobody, async () => ({
        blocks: (await client.query('select id from sport_blocks')).rowCount,
        games: (await client.query('select id from games')).rowCount,
        teams: (await client.query('select id from ministry_teams')).rowCount,
      }));
      expect(seen).toEqual({ blocks: 0, games: 0, teams: 0 });
    });
  });

  it('gives an anonymous request no access at all', async () => {
    await withTx(pool, async (client) => {
      for (const table of ['sport_blocks', 'games', 'game_results', 'sport_block_places']) {
        await client.query('SAVEPOINT anon_check');
        await client.query('SET LOCAL ROLE anon');
        expect(await code(client.query(`select * from ${table}`))).toBe('42501');
        await client.query('ROLLBACK TO SAVEPOINT anon_check');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

describe('teams', () => {
  it('defaults a new team to the current season', async () => {
    await withTx(pool, async (client) => {
      const [id] = await seedTeams(client, 1);
      const row = (await client.query('select season_id from ministry_teams where id = $1', [id])).rows[0];
      expect(row.season_id).toBe(await currentSeason(client));
    });
  });

  it('requires a division, and rejects a duplicate name within a season and division', async () => {
    await withTx(pool, async (client) => {
      await client.query('SAVEPOINT nodiv');
      expect(await code(client.query(`insert into ministry_teams (name) values ('No division')`))).toBe('23502');
      await client.query('ROLLBACK TO SAVEPOINT nodiv');
      await client.query('SAVEPOINT dup');
      await client.query(`insert into ministry_teams (name, division) values ('Lions', 'juniors')`);
      expect(await code(client.query(`insert into ministry_teams (name, division) values ('Lions', 'juniors')`))).toBe(
        '23505'
      );
      await client.query('ROLLBACK TO SAVEPOINT dup');
      // The same name in the other division is a different team.
      await client.query(`insert into ministry_teams (name, division) values ('Lions', 'ambassadors')`);
    });
  });

  it('keeps team management Admin-only: Program Team can read teams but not create them', async () => {
    await withTx(pool, async (client) => {
      const program = await userWithRole(client, 'program');
      expect(
        await code(
          asUser(client, program, () =>
            client.query(`insert into ministry_teams (name, division) values ('Sneaky', 'juniors')`)
          )
        )
      ).toBe('42501');

      const admin = await userWithRole(client, 'admin');
      await asUser(client, admin, () =>
        client.query(`insert into ministry_teams (name, division) values ('Legit', 'juniors')`)
      );
    });
  });

  it('refuses to delete a team that has games', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client);
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(teams));
      expect(await code(client.query('delete from ministry_teams where id = $1', [teams[0]]))).toBe('23503');
    });
  });
});

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

describe('sport blocks', () => {
  it('checks that league_structure matches the format', async () => {
    await withTx(pool, async (client) => {
      const season = await currentSeason(client);
      const insert = (format: string, structure: string | null) =>
        client.query(
          `insert into sport_blocks (season_id, division, sport, format, league_structure)
           values ($1, 'juniors', $2, $3, $4)`,
          [season, `${format}-${structure}`, format, structure]
        );

      for (const [format, structure] of [
        ['knockout', 'round_robin'],
        ['league', null],
        ['league', 'groups'],
        ['league_knockout', null],
      ] as const) {
        await client.query('SAVEPOINT s');
        expect(await code(insert(format, structure))).toBe('23514');
        await client.query('ROLLBACK TO SAVEPOINT s');
      }
      await insert('knockout', null);
      await insert('league_knockout', 'groups');
      await insert('league_knockout', 'round_robin');
    });
  });

  it('freezes the format once games exist, but still lets settings change', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client, { format: 'league_knockout' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(teams));

      expect(
        await code(asUser(client, program, () => client.query(`update sport_blocks set format = 'league' where id = $1`, [block])))
      ).toBe('55000');
      expect(
        await code(
          asUser(client, program, () =>
            client.query(`update sport_blocks set settings = '{"max_sets":3}' where id = $1`, [block])
          )
        )
      ).toBe('ok');
      expect((await games(client, block))['L0-1']).toBeDefined();
    });
  });

  it('resets a block back to setup, after which its format can change', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client, { format: 'league' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(teams));

      await asUser(client, program, () => client.query('select public.reset_sport_block($1)', [block]));

      expect((await client.query('select count(*)::int n from games where sport_block_id = $1', [block])).rows[0].n).toBe(0);
      expect((await client.query('select status from sport_blocks where id = $1', [block])).rows[0].status).toBe('setup');
      expect(
        await code(
          asUser(client, program, () =>
            client.query(`update sport_blocks set format = 'knockout', league_structure = null where id = $1`, [block])
          )
        )
      ).toBe('ok');

      const coach = await userWithRole(client, 'coach');
      expect(await code(asUser(client, coach, () => client.query('select public.reset_sport_block($1)', [block])))).toBe(
        '42501'
      );
    });
  });
});

// ---------------------------------------------------------------------------
// create_sport_block_games: validation
// ---------------------------------------------------------------------------

describe('create_sport_block_games', () => {
  it.each([
    ['a duplicate key', (gs: G[]) => [...gs, { ...gs[0] }]],
    ['a league game with an unknown team', (gs: G[]) => [{ ...gs[0], away_team_id: null }, ...gs.slice(1)]],
    ['a league game with an exit', (gs: G[]) => [{ ...gs[0], winner_place: 1 }, ...gs.slice(1)]],
    ['a team playing itself', (gs: G[]) => [{ ...gs[0], away_team_id: gs[0].home_team_id }, ...gs.slice(1)]],
  ])('rejects %s', async (_name, mutate) => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client, { format: 'league' });
      const program = await userWithRole(client, 'program');
      expect(await code(createGames(client, program, block, mutate(roundRobin(teams))))).toBe('22023');
    });
  });

  it('rejects teams from another division or season', async () => {
    await withTx(pool, async (client) => {
      const other = await seedTeams(client, 6, 'ambassadors');
      const block = await seedBlock(client, { format: 'league', division: 'juniors' });
      const program = await userWithRole(client, 'program');
      expect(await code(createGames(client, program, block, roundRobin(other)))).toBe('22023');
    });
  });

  it('rejects fewer than 6 teams', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 5);
      const block = await seedBlock(client, { format: 'league' });
      const program = await userWithRole(client, 'program');
      expect(await code(createGames(client, program, block, roundRobin(teams)))).toBe('22023');
    });
  });

  it('rejects more than 8 teams', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 9);
      const block = await seedBlock(client, { format: 'league' });
      const program = await userWithRole(client, 'program');
      expect(await code(createGames(client, program, block, roundRobin(teams)))).toBe('22023');
    });
  });

  describe('knockout graph', () => {
    const run = async (mutate: (gs: G[]) => G[]) =>
      withTx(pool, async (client) => {
        const teams = await seedTeams(client, 6);
        const block = await seedBlock(client, { format: 'knockout' });
        const program = await userWithRole(client, 'program');
        return code(createGames(client, program, block, mutate(bracket6Full(teams))));
      });

    it('accepts a valid bracket', async () => {
      expect(await run((gs) => gs)).toBe('ok');
    });

    it('rejects a game with no exit for its winner', async () => {
      expect(await run((gs) => gs.map((x) => (x.key === 'sf1' ? { ...x, winner_to: undefined } : x)))).toBe('22023');
    });

    it('rejects a game that both advances and takes a place', async () => {
      expect(await run((gs) => gs.map((x) => (x.key === 'q1' ? { ...x, winner_place: 9 } : x)))).toBe('22023');
    });

    it('rejects an edge to a game in an earlier round', async () => {
      expect(await run((gs) => gs.map((x) => (x.key === 'f' ? { ...x, winner_to: { key: 'q1', slot: 'home' }, winner_place: undefined } : x)))).toBe('22023');
    });

    it('rejects an edge to a missing game', async () => {
      expect(await run((gs) => gs.map((x) => (x.key === 'q1' ? { ...x, winner_to: { key: 'nope', slot: 'home' } } : x)))).toBe('22023');
    });

    it('rejects two games feeding the same slot', async () => {
      expect(await run((gs) => gs.map((x) => (x.key === 'q2' ? { ...x, winner_to: { key: 'sf1', slot: 'away' } } : x)))).toBe('22023');
    });

    it('rejects an edge into a slot that already holds a seeded team', async () => {
      expect(await run((gs) => gs.map((x) => (x.key === 'q1' ? { ...x, winner_to: { key: 'sf1', slot: 'home' } } : x)))).toBe('22023');
    });
  });

  it('only allows knockout games once the block is ready for them', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const program = await userWithRole(client, 'program');

      // Knockout games on a league-only block.
      const league = await seedBlock(client, { format: 'league', sport: 'a' });
      expect(await code(createGames(client, program, league, bracket6Full(teams)))).toBe('55000');

      // League games on a knockout-only block.
      const ko = await seedBlock(client, { format: 'knockout', sport: 'b' });
      expect(await code(createGames(client, program, ko, roundRobin(teams)))).toBe('22023');

      // Knockout games before the league has been played.
      const lk = await seedBlock(client, { format: 'league_knockout', sport: 'c' });
      expect(await code(createGames(client, program, lk, knockout6Split(teams)))).toBe('55000');
      await createGames(client, program, lk, roundRobin(teams));
      expect(await code(createGames(client, program, lk, knockout6Split(teams)))).toBe('55000');

      // And not twice.
      expect(await code(createGames(client, program, league, roundRobin(teams)))).toBe('ok');
      expect(await code(createGames(client, program, league, roundRobin(teams)))).toBe('55000');
    });
  });

  it('moves the block status forward', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const program = await userWithRole(client, 'program');
      const status = async (b: string) => (await client.query('select status from sport_blocks where id = $1', [b])).rows[0].status;

      const ko = await seedBlock(client, { format: 'knockout', sport: 'k' });
      await createGames(client, program, ko, bracket6Full(teams));
      expect(await status(ko)).toBe('knockout');

      const lg = await seedBlock(client, { format: 'league', sport: 'l' });
      await createGames(client, program, lg, roundRobin(teams));
      expect(await status(lg)).toBe('league');
    });
  });
});

// ---------------------------------------------------------------------------
// record_game_result
// ---------------------------------------------------------------------------

describe('record_game_result', () => {
  it('stores a drawn league game with no winner, and stamps who recorded it', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client);
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(teams));
      const game = (await games(client, block))['L0-1'];

      await record(client, program, game.id, 2, 2, null, { home_score: 2, away_score: 2 });

      const r = (await client.query('select * from game_results where game_id = $1', [game.id])).rows[0];
      expect(r.winner_team_id).toBeNull();
      expect(r.recorded_by).toBe(program);
      expect(r.details).toEqual({ home_score: 2, away_score: 2 });
      expect((await games(client, block))['L0-1'].status).toBe('completed');
    });
  });

  it('rejects bad input', async () => {
    await withTx(pool, async (client) => {
      const teams = await seedTeams(client, 6);
      const block = await seedBlock(client);
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(teams));
      const game = (await games(client, block))['L0-1'];

      expect(await code(record(client, program, game.id, -1, 0))).toBe('22023');
      expect(await code(record(client, program, game.id, 1, 0, teams[0]))).toBe('22023'); // league: no tiebreak
      expect(
        await code(asUser(client, program, () => client.query(`select public.record_game_result($1, 1, 0, null, '[]'::jsonb)`, [game.id])))
      ).toBe('22023');
      expect(await code(record(client, program, '00000000-0000-0000-0000-000000000000', 1, 0))).toBe('P0002');
    });
  });

  describe('knockout', () => {
    it('needs a tiebreak winner when the score is level, and uses it', async () => {
      await withTx(pool, async (client) => {
        const t = await seedTeams(client, 6);
        const block = await seedBlock(client, { format: 'knockout' });
        const program = await userWithRole(client, 'program');
        await createGames(client, program, block, bracket6Full(t));
        const q1 = (await games(client, block)).q1;

        expect(await code(record(client, program, q1.id, 1, 1))).toBe('22023');
        expect(await code(record(client, program, q1.id, 1, 1, t[0]))).toBe('22023'); // not in this game
        expect(await code(record(client, program, q1.id, 2, 1, t[3]))).toBe('22023'); // not level

        await record(client, program, q1.id, 1, 1, t[4]); // away team wins the shootout
        const after = await games(client, block);
        expect(after.sf1.away_team_id).toBe(t[4]);
        expect(after.p5.home_team_id).toBe(t[3]);
      });
    });

    it('will not record a game whose teams are not known yet', async () => {
      await withTx(pool, async (client) => {
        const t = await seedTeams(client, 6);
        const block = await seedBlock(client, { format: 'knockout' });
        const program = await userWithRole(client, 'program');
        await createGames(client, program, block, bracket6Full(t));
        expect(await code(record(client, program, (await games(client, block)).sf1.id, 1, 0))).toBe('55000');
      });
    });

    it('moves both teams when a result is edited before the next game is played', async () => {
      await withTx(pool, async (client) => {
        const t = await seedTeams(client, 6);
        const block = await seedBlock(client, { format: 'knockout' });
        const program = await userWithRole(client, 'program');
        await createGames(client, program, block, bracket6Full(t));
        const q1 = (await games(client, block)).q1;

        await record(client, program, q1.id, 2, 1); // t[3] wins
        let g1 = await games(client, block);
        expect([g1.sf1.away_team_id, g1.p5.home_team_id]).toEqual([t[3], t[4]]);

        await record(client, program, q1.id, 0, 3); // flipped: t[4] wins
        g1 = await games(client, block);
        expect([g1.sf1.away_team_id, g1.p5.home_team_id]).toEqual([t[4], t[3]]);
      });
    });

    it('refuses to edit a result once a game it fed has been played, and changes nothing', async () => {
      await withTx(pool, async (client) => {
        const t = await seedTeams(client, 6);
        const block = await seedBlock(client, { format: 'knockout' });
        const program = await userWithRole(client, 'program');
        await createGames(client, program, block, bracket6Full(t));
        let g1 = await games(client, block);

        await record(client, program, g1.q1.id, 2, 1);
        await record(client, program, g1.sf1.id, 2, 1); // t[0] beats t[3]

        expect(await code(record(client, program, g1.q1.id, 0, 3))).toBe('55000');
        g1 = await games(client, block);
        expect(g1.sf1.away_team_id).toBe(t[3]);
        const winner = (await client.query('select winner_team_id from game_results where game_id = $1', [g1.q1.id])).rows[0];
        expect(winner.winner_team_id).toBe(t[3]);

        // Clearing the later game first unblocks the edit.
        await asUser(client, program, () => client.query('select public.clear_game_result($1)', [g1.sf1.id]));
        await record(client, program, g1.q1.id, 0, 3);
        expect((await games(client, block)).sf1.away_team_id).toBe(t[4]);
      });
    });

    it('lets a score be corrected after the next game, as long as the winner stays the same', async () => {
      await withTx(pool, async (client) => {
        const t = await seedTeams(client, 6);
        const block = await seedBlock(client, { format: 'knockout' });
        const program = await userWithRole(client, 'program');
        await createGames(client, program, block, bracket6Full(t));
        const g1 = await games(client, block);
        await record(client, program, g1.q1.id, 2, 1);
        await record(client, program, g1.sf1.id, 2, 1);

        // 3-0 instead of 2-1: same winner, so the semi-final already played is still valid.
        expect(await code(record(client, program, g1.q1.id, 3, 0))).toBe('ok');
        expect((await games(client, block)).sf1.away_team_id).toBe(t[3]);
        const r = (await client.query('select home_total from game_results where game_id = $1', [g1.q1.id])).rows[0];
        expect(r.home_total).toBe(3);

        // Changing who won is still refused.
        expect(await code(record(client, program, g1.q1.id, 0, 3))).toBe('55000');
      });
    });

    it('clear_game_result empties the slots a result filled', async () => {
      await withTx(pool, async (client) => {
        const t = await seedTeams(client, 6);
        const block = await seedBlock(client, { format: 'knockout' });
        const program = await userWithRole(client, 'program');
        await createGames(client, program, block, bracket6Full(t));
        const q1 = (await games(client, block)).q1;

        expect(await code(asUser(client, program, () => client.query('select public.clear_game_result($1)', [q1.id])))).toBe('55000'); // nothing to clear
        await record(client, program, q1.id, 2, 1);
        await asUser(client, program, () => client.query('select public.clear_game_result($1)', [q1.id]));

        const after = await games(client, block);
        expect(after.q1.status).toBe('scheduled');
        expect([after.sf1.away_team_id, after.p5.home_team_id]).toEqual([null, null]);
        expect((await client.query('select count(*)::int n from game_results where game_id = $1', [q1.id])).rows[0].n).toBe(0);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Whole blocks, start to finish
// ---------------------------------------------------------------------------

describe('a league block', () => {
  it('completes with the ranked places, and is then locked', async () => {
    await withTx(pool, async (client) => {
      const t = await seedTeams(client, 6);
      const block = await seedBlock(client, { format: 'league' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(t));
      const complete = (places: string[] | null) =>
        asUser(client, program, () => client.query('select public.complete_sport_block($1, $2::uuid[])', [block, places]));

      expect(await code(complete(t))).toBe('55000'); // nothing played yet

      const all = Object.values(await games(client, block));
      for (const gm of all.slice(0, -1)) await record(client, program, gm.id, 1, 0);
      expect(await code(complete(t))).toBe('55000'); // one game left

      await record(client, program, all[all.length - 1].id, 1, 0);
      expect(await code(complete(null))).toBe('22023');
      expect(await code(complete(t.slice(1)))).toBe('22023');
      expect(await code(complete([...t.slice(1), t[1]]))).toBe('22023'); // duplicate

      const ranked = [t[2], t[0], t[1], t[5], t[4], t[3]];
      expect(await code(complete(ranked))).toBe('ok');

      const places = await placesOf(client, block);
      expect(Object.keys(places).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(places[1]).toBe(t[2]);
      expect(places[6]).toBe(t[3]);

      expect((await client.query('select status from sport_blocks where id = $1', [block])).rows[0].status).toBe('completed');
      expect(await code(record(client, program, all[0].id, 5, 0))).toBe('55000');
      expect(await code(complete(ranked))).toBe('55000');
    });
  });
});

describe('a league then knockout block', () => {
  it('locks league results once the knockout is created, and finishes with places 1..6', async () => {
    await withTx(pool, async (client) => {
      const t = await seedTeams(client, 6);
      const block = await seedBlock(client, { format: 'league_knockout', structure: 'groups' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(t));

      // Knockout cannot start while league games are unplayed.
      expect(await code(createGames(client, program, block, knockout6Split(t)))).toBe('55000');

      const league = Object.values(await games(client, block));
      for (const gm of league) await record(client, program, gm.id, 1, 0);

      // Same teams only.
      const [otherTeam] = await seedTeams(client, 1, 'ambassadors');
      expect(await code(createGames(client, program, block, knockout6Split([...t.slice(0, 5), otherTeam])))).toBe('22023');

      expect(await code(createGames(client, program, block, knockout6Split(t)))).toBe('ok');
      expect(await code(record(client, program, league[0].id, 0, 1))).toBe('55000');
      expect(
        await code(asUser(client, program, () => client.query('select public.clear_game_result($1)', [league[0].id])))
      ).toBe('55000');

      await playOut(client, program, block);
      await asUser(client, program, () => client.query('select public.complete_sport_block($1, null)', [block]));

      const places = await placesOf(client, block);
      expect(Object.keys(places).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(Object.values(places)).size).toBe(6);
    });
  });
});

describe('a six-team knockout (prototype bug: 5th-place winner reached the Final)', () => {
  it('keeps the 5th-place game out of the Final and gives every team a place', async () => {
    await withTx(pool, async (client) => {
      const t = await seedTeams(client, 6);
      const block = await seedBlock(client, { format: 'knockout' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, bracket6Full(t));

      await playOut(client, program, block);
      const g1 = await games(client, block);
      expect(Object.values(g1).every((x) => x.status === 'completed')).toBe(true);

      const fifthTeams = [g1.p5.home_team_id, g1.p5.away_team_id];
      expect(fifthTeams).not.toContain(g1.f.home_team_id);
      expect(fifthTeams).not.toContain(g1.f.away_team_id);

      await asUser(client, program, () => client.query('select public.complete_sport_block($1, null)', [block]));
      const places = await placesOf(client, block);
      expect(Object.keys(places).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(Object.values(places)).size).toBe(6);
      expect(places[1]).toBe(t[0]); // top seed, home team wins every game
    });
  });
});

describe('an eight-team knockout (prototype bug: the 5th-8th bracket never filled)', () => {
  it('fills every game and gives places 1..8', async () => {
    await withTx(pool, async (client) => {
      const t = await seedTeams(client, 8);
      const block = await seedBlock(client, { format: 'knockout' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, bracket8Full(t));

      await playOut(client, program, block);
      const g1 = await games(client, block);
      expect(Object.keys(g1)).toHaveLength(12);
      for (const label of ['f', 'third', 'p5', 'p7', 'ps1', 'ps2']) {
        expect(g1[label].home_team_id).not.toBeNull();
        expect(g1[label].away_team_id).not.toBeNull();
        expect(g1[label].status).toBe('completed');
      }

      await asUser(client, program, () => client.query('select public.complete_sport_block($1, null)', [block]));
      const places = await placesOf(client, block);
      expect(Object.keys(places).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(new Set(Object.values(places)).size).toBe(8);
    });
  });

  it('refuses to complete while a game is unplayed or the format forbids the places argument', async () => {
    await withTx(pool, async (client) => {
      const t = await seedTeams(client, 8);
      const block = await seedBlock(client, { format: 'knockout' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, bracket8Full(t));
      expect(
        await code(asUser(client, program, () => client.query('select public.complete_sport_block($1, null)', [block])))
      ).toBe('55000');
      await playOut(client, program, block);
      expect(
        await code(asUser(client, program, () => client.query('select public.complete_sport_block($1, $2::uuid[])', [block, t])))
      ).toBe('22023');
    });
  });
});

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

describe('set_game_schedule', () => {
  it('lets Program Team schedule games, refuses others, and refuses a completed block', async () => {
    await withTx(pool, async (client) => {
      const t = await seedTeams(client, 6);
      const block = await seedBlock(client, { format: 'league' });
      const program = await userWithRole(client, 'program');
      await createGames(client, program, block, roundRobin(t));
      const first = (await games(client, block))['L0-1'];

      const items = [{ game_id: first.id, scheduled_date: '2026-10-17', scheduled_time: '14:00', court: 2 }];
      const call = (as: string, payload: unknown) =>
        asUser(client, as, () => client.query('select public.set_game_schedule($1::jsonb) as n', [JSON.stringify(payload)]));

      const coach = await userWithRole(client, 'coach');
      expect(await code(call(coach, items))).toBe('42501');

      expect((await call(program, items)).rows[0].n).toBe(1);
      const row = (await client.query('select scheduled_date::text d, scheduled_time::text t, court from games where id = $1', [first.id])).rows[0];
      expect(row).toEqual({ d: '2026-10-17', t: '14:00:00', court: 2 });

      // null unschedules
      await call(program, [{ game_id: first.id, scheduled_date: null, scheduled_time: null, court: null }]);
      expect((await client.query('select court from games where id = $1', [first.id])).rows[0].court).toBeNull();

      expect(await code(call(program, [{ game_id: '00000000-0000-0000-0000-000000000000' }]))).toBe('P0002');

      for (const gm of Object.values(await games(client, block))) await record(client, program, gm.id, 1, 0);
      await asUser(client, program, () => client.query('select public.complete_sport_block($1, $2::uuid[])', [block, t]));
      expect(await code(call(program, items))).toBe('55000');
    });
  });
});

// ---------------------------------------------------------------------------
// Trigger functions are not part of the public API
// ---------------------------------------------------------------------------

describe('trigger functions', () => {
  it('are not executable by anon or signed-in users', async () => {
    const fns = ['guard_sport_block_shape()', 'set_team_season()', 'set_day_season()'];
    for (const fn of fns) {
      const r = await pool.query(
        `select has_function_privilege('anon', 'public.${fn}', 'execute') as anon,
                has_function_privilege('authenticated', 'public.${fn}', 'execute') as authed`
      );
      expect(r.rows[0]).toEqual({ anon: false, authed: false });
    }
  });

  it('still fire for an Admin who creates a team', async () => {
    await withTx(pool, async (client) => {
      const admin = await userWithRole(client, 'admin');
      await asUser(client, admin, () =>
        client.query(`insert into ministry_teams (name, division) values ('Fires trigger', 'juniors')`)
      );
      const row = (await client.query(`select season_id from ministry_teams where name = 'Fires trigger'`)).rows[0];
      expect(row.season_id).toBe(await currentSeason(client));
    });
  });
});
