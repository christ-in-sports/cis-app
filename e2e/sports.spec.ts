/**
 * The Sports screens as a read-only user sees them (ENG-15).
 *
 * Seeds a small season through the real database functions, impersonating a
 * Program Team user the way supabase/tests/helpers.ts does, then signs in as a
 * coach, who may look but not score. Checks that standings, schedule and bracket
 * show what was seeded, that "your team" is flagged, that rank holds when a table
 * is sorted, and that no editing control is offered.
 *
 * Writes teams and sport blocks to the CURRENT season, and clears that season's
 * sport blocks first so the counts it asserts are exact (the same approach as
 * roster-import.spec.ts, which clears the roster). It therefore refuses to run
 * against anything but a local database, and removes what it created.
 */

import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

import { generateBracket } from '../src/lib/competition/bracket';
import { generateLeague } from '../src/lib/competition/fixtures';
import { bracketToRpc, leagueToRpc } from '../src/lib/competition/plan';
import { seededRng } from '../src/lib/competition/rng';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const COACH = 'e2e-sports-coach@local.test';
const PROGRAM = 'e2e-sports-program@local.test';
const PASSWORD = 'localdevpassword123';

const JUNIORS = ['Lions', 'Falcons', 'Eagles', 'Hawks', 'Comets', 'Warriors'].map((n) => `E2E ${n}`);
const AMBASSADORS = ['Saints', 'Kings', 'Titans', 'Pilgrims', 'Shepherds', 'Rangers'].map((n) => `E2E ${n}`);

function assertLocalDatabase(): void {
  const host = new URL(DB_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`sports.spec.ts writes sport blocks and must only run against a local database, not "${host}".`);
  }
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  assertLocalDatabase();
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function localStackIsRunning(): Promise<boolean> {
  try {
    assertLocalDatabase();
    return (await fetch(`${AUTH_URL}/auth/v1/health`)).ok;
  } catch {
    return false;
  }
}

async function ensureUser(email: string, role: string): Promise<string> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  }).catch(() => undefined); // already exists is fine

  return withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>('select id from auth.users where email = $1', [email]);
    await client.query('insert into user_roles (user_id, role) values ($1, $2) on conflict do nothing', [rows[0].id, role]);
    return rows[0].id;
  });
}

async function cleanup(): Promise<void> {
  await withDb(async (client) => {
    // Blocks first: games hold their teams, and deleting a block removes its games.
    await client.query(`delete from sport_blocks where season_id in (select id from seasons where is_current)`);
    await client.query(`delete from ministry_teams where name like 'E2E %'`);
  });
}

/** Runs `sql` as the Program Team user, the way PostgREST would. */
async function asProgram(client: Client, userId: string, run: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    await client.query('SET LOCAL ROLE authenticated');
    await run();
    await client.query('RESET ROLE');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function seed(coachId: string, programId: string): Promise<void> {
  await withDb(async (client) => {
    const season = (await client.query<{ id: string }>('select id from seasons where is_current limit 1')).rows[0]?.id
      ?? (await client.query<{ id: string }>(`insert into seasons (name, is_current, starts_on, ends_on) values ('E2E season', true, '2026-10-12', '2026-12-07') returning id`)).rows[0].id;

    const teamIds = async (division: string, names: string[]) => {
      const ids: string[] = [];
      for (const name of names) {
        ids.push((await client.query<{ id: string }>(
          `insert into ministry_teams (name, division, season_id) values ($1, $2, $3) returning id`, [name, division, season])).rows[0].id);
      }
      return ids;
    };
    const jr = await teamIds('juniors', JUNIORS);
    const am = await teamIds('ambassadors', AMBASSADORS);
    // The coach coaches the Falcons, so "Your team" is theirs.
    await client.query('delete from team_coaches where user_id = $1', [coachId]);
    await client.query('insert into team_coaches (team_id, user_id) values ($1, $2)', [jr[1], coachId]);

    const block = async (division: string, format: string, structure: string | null) =>
      (await client.query<{ id: string }>(
        `insert into sport_blocks (season_id, division, sport, format, league_structure, starts_on, ends_on)
         values ($1, $2, 'soccer', $3, $4, '2026-10-12', '2026-12-07') returning id`,
        [season, division, format, structure])).rows[0].id;
    const juniorsBlock = await block('juniors', 'league', 'round_robin');
    const ambassadorsBlock = await block('ambassadors', 'knockout', null);

    await asProgram(client, programId, async () => {
      // Juniors: a six-team league, the first three rounds played, two of them scheduled.
      const league = generateLeague(jr, 'round_robin', seededRng(11));
      await client.query('select create_sport_block_games($1, $2::jsonb)', [juniorsBlock, JSON.stringify(leagueToRpc(league.fixtures))]);
      const games = (await client.query<{ id: string; home_team_id: string; away_team_id: string; round: number }>(
        `select id, home_team_id, away_team_id, round from games where sport_block_id = $1 order by round, id`, [juniorsBlock])).rows;
      for (const g of games.filter((x) => x.round <= 3)) {
        const homeWins = jr.indexOf(g.home_team_id) < jr.indexOf(g.away_team_id);
        await client.query(
          `select record_game_result($1, $2, $3, null, $4::jsonb)`,
          [g.id, homeWins ? 2 : 1, homeWins ? 1 : 2, JSON.stringify({ home: homeWins ? 2 : 1, away: homeWins ? 1 : 2 })]
        );
      }
      const items = games.slice(0, 4).map((g, i) => ({
        game_id: g.id, scheduled_date: '2026-10-17', scheduled_time: `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:00`, court: (i % 2) + 1,
      }));
      await client.query('select set_game_schedule($1::jsonb)', [JSON.stringify(items)]);

      // Ambassadors: a six-team knockout with the first quarter-final played.
      const bracket = bracketToRpc(generateBracket({ seeds: am, shape: 'full' }));
      await client.query('select create_sport_block_games($1, $2::jsonb)', [ambassadorsBlock, JSON.stringify(bracket)]);
      const qf1 = (await client.query<{ id: string }>(
        `select id from games where sport_block_id = $1 and label = 'Quarter-final 1'`, [ambassadorsBlock])).rows[0].id;
      await client.query(`select record_game_result($1, 3, 1, null, $2::jsonb)`, [qf1, JSON.stringify({ home: 3, away: 1 })]);
    });
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!(await localStackIsRunning()), 'needs a local Supabase stack -- run `npx supabase start` first');
  const coachId = await ensureUser(COACH, 'coach');
  const programId = await ensureUser(PROGRAM, 'program');
  await cleanup();
  await seed(coachId, programId);
});

test.afterAll(async () => {
  if (await localStackIsRunning()) await cleanup();
});

test('a signed-out visitor is sent to sign in', async ({ page }) => {
  await page.goto('/sports');
  await expect(page).toHaveURL(/\/login/);
});

test('a coach reads standings, schedule and bracket, and is offered nothing to edit', async ({ page }) => {
  // The "Updated 2:41 PM" note is formatted in the browser; a mismatch with the
  // server render would surface as a hydration error.
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  await signIn(page, COACH);

  // ---- Standings --------------------------------------------------------
  await page.goto('/sports');
  await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Juniors/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('League · round 4 of 5')).toBeVisible();
  await expect(page.getByText('Updated', { exact: true })).toBeVisible();

  const table = page.getByRole('table', { name: 'Juniors soccer standings' });
  await expect(table.getByRole('row')).toHaveCount(7); // header + six teams
  await expect(table.getByText('Your team')).toHaveCount(1);
  await expect(table.getByRole('row', { name: /E2E Falcons/ }).getByText('Your team')).toBeVisible();
  await page.screenshot({ path: 'test-results/sports-1-standings.png', fullPage: true });

  // Sorting by name re-orders the rows but never a rank: the leader is still 1.
  const leader = table.getByRole('row').nth(1);
  const leaderName = (await leader.getByRole('cell').nth(1).innerText()).split('\n')[0];
  await table.getByRole('button', { name: 'Team' }).click();
  await expect(table.getByRole('row').nth(1).getByRole('cell').nth(1)).toContainText('E2E Comets');
  const sortedLeader = table.getByRole('row', { name: new RegExp(leaderName) });
  await expect(sortedLeader.getByRole('cell').first()).toHaveText('1');

  // Ambassadors play a knockout, so there is no league table, only a way to the bracket.
  await page.getByRole('link', { name: /Ambassadors/ }).click();
  await expect(page.getByRole('heading', { name: 'No league table' })).toBeVisible();

  // ---- Schedule ---------------------------------------------------------
  await page.goto('/sports/schedule?division=juniors');
  await expect(page.getByRole('heading', { name: 'Saturday, Oct 17' })).toBeVisible();
  await expect(page.getByText('2 slots · 2 courts')).toBeVisible();
  await expect(page.getByText('Final').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/sports-2-schedule.png', fullPage: true });

  // "Falcons only" narrows the day to games the coach's team plays.
  await page.getByRole('link', { name: 'E2E Falcons only' }).click();
  await expect(page).toHaveURL(/mine=1/);
  const games = page.getByRole('table', { name: /Games on/ }).getByRole('row');
  const count = await games.count();
  for (let i = 1; i < count; i++) await expect(games.nth(i)).toContainText('E2E Falcons');

  // ---- Bracket ----------------------------------------------------------
  await page.goto('/sports/bracket?division=ambassadors');
  await expect(page.getByRole('heading', { name: 'Quarter-finals' })).toBeVisible();
  await expect(page.getByText('1 of 2 played')).toBeVisible();
  await expect(page.getByText('Bye', { exact: true })).toHaveCount(2); // seeds 1 and 2 skip the quarters
  await expect(page.getByText(/Winner of Quarter-final/).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Jump to a round' }).getByRole('link', { name: 'Semis' })).toHaveAttribute('href', '#round-semis');
  await page.screenshot({ path: 'test-results/sports-3-bracket.png', fullPage: true });

  // ---- Nothing to edit --------------------------------------------------
  for (const path of ['/sports', '/sports/schedule', '/sports/bracket']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Sports' }).getByRole('link', { name: 'Manage' })).toHaveCount(0);
    await expect(page.getByText(/enter score|edit score/i)).toHaveCount(0);
  }

  // Only one nav item is current at a time (Standings once matched every sub-page).
  await page.goto('/sports/schedule');
  await expect(page.getByRole('navigation', { name: 'Sports' }).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Schedule', exact: true })).toHaveAttribute('aria-current', 'page');

  // The scoring screen itself sends a reader back to the schedule.
  await page.goto('/sports/bracket?division=ambassadors');
  await page.goto('/sports/score/00000000-0000-0000-0000-000000000000');
  await expect(page.getByText('Page not found').or(page.getByRole('heading', { name: 'Schedule' })).first()).toBeVisible();

  // Only hydration and render errors are checked; other console noise (fonts,
  // the realtime socket) is not this screen's concern.
  expect(problems.filter((p) => /hydrat|did not match|Minified React error/i.test(p))).toEqual([]);
});

test('the division and sport a reader chose follow them between screens', async ({ page }) => {
  await signIn(page, COACH);
  const nav = page.getByRole('navigation', { name: 'Sports' });

  // A page opened bare fills in what it resolved, so the nav can carry it.
  await page.goto('/sports/schedule');
  await expect(page).toHaveURL(/division=juniors&block=/);

  // Choosing Ambassadors, then moving around, stays on Ambassadors.
  await page.goto('/sports/bracket?division=ambassadors');
  await nav.getByRole('link', { name: 'Standings' }).click();
  await expect(page).toHaveURL(/division=ambassadors/);
  await nav.getByRole('link', { name: 'Schedule' }).click();
  await expect(page).toHaveURL(/division=ambassadors&block=/);
  await expect(page.getByRole('link', { name: /Ambassadors/ })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Bracket' }).click();
  await expect(page).toHaveURL(/division=ambassadors&block=/);

  // "All blocks" on the schedule is a choice too, and sticks.
  await page.goto('/sports/schedule?division=juniors');
  await page.getByRole('link', { name: 'All blocks' }).click();
  await expect(page).toHaveURL(/block=all/);
  await nav.getByRole('link', { name: 'Standings' }).click();
  await nav.getByRole('link', { name: 'Schedule' }).click();
  await expect(page).toHaveURL(/block=all/);
});

test('a Program Team member scores a knockout game, is asked for a tiebreak, and corrections are guarded', async ({ page }) => {
  await signIn(page, PROGRAM);
  await page.goto('/sports/bracket?division=ambassadors');
  await expect(page.getByRole('navigation', { name: 'Sports' }).getByRole('link', { name: 'Manage' })).toHaveCount(0);

  // ---- A level knockout game asks who won the tiebreak ---------------------
  await page.getByRole('link', { name: 'Enter score: Quarter-final 2' }).click();
  await expect(page.getByRole('heading', { name: 'Score entry' })).toBeVisible();
  await expect(page.getByText('Knockout · no draws')).toBeVisible();
  await page.getByRole('button', { name: /One more goal for/ }).nth(0).click();
  await page.getByRole('button', { name: /One more goal for/ }).nth(1).click();
  await expect(page.getByText('Level after full time')).toBeVisible();
  await expect(page.getByText('Who won the penalty shootout?')).toBeVisible();

  // Saving while level with nobody picked is stopped before it reaches the database.
  await page.getByRole('button', { name: 'Save score' }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("A knockout game can't end level");
  await page.screenshot({ path: 'test-results/sports-4-tiebreak.png', fullPage: true });

  const pickers = page.getByRole('button', { pressed: false }).filter({ hasText: /^E2E / });
  await pickers.nth(1).click();
  await page.getByRole('button', { name: 'Save score' }).click();

  // ---- Saved panel names where the winner went -----------------------------
  await expect(page.getByRole('heading', { name: 'Score saved' })).toBeVisible();
  const advances = await page.getByText(/advance to Semi-final \d/).innerText();
  const semi = /Semi-final \d/.exec(advances)![0];
  await page.screenshot({ path: 'test-results/sports-5-saved.png', fullPage: true });
  await page.getByRole('link', { name: 'Back to schedule' }).click();

  // ---- Play the game it fed, then try to change the winner behind it -------
  await page.goto('/sports/bracket?division=ambassadors');
  await page.getByRole('link', { name: `Enter score: ${semi}` }).click();
  await page.getByRole('button', { name: /One more goal for/ }).nth(0).click();
  await page.getByRole('button', { name: 'Save score' }).click();
  await expect(page.getByRole('heading', { name: 'Score saved' })).toBeVisible();

  await page.goto('/sports/bracket?division=ambassadors');
  await page.getByRole('link', { name: 'Edit score: Quarter-final 2' }).click();
  await expect(page.getByRole('heading', { name: 'Edit score' })).toBeVisible();
  // 2-1 to the home side flips the winner from the tiebreak pick.
  await page.getByRole('button', { name: /One more goal for/ }).nth(0).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Can't change the winner");
  await expect(page.getByRole('button', { name: 'Save score' })).toBeDisabled();
  await expect(page.getByRole('link', { name: `Open ${semi}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear this result' })).toBeDisabled();
  await expect(page.getByText(`Blocked until ${semi} is cleared`)).toBeVisible();
  await page.screenshot({ path: 'test-results/sports-6-blocked.png', fullPage: true });

  // ---- Clear them in order, each with a confirmation -----------------------
  await page.goto('/sports/bracket?division=ambassadors');
  await page.getByRole('link', { name: `Edit score: ${semi}` }).click();
  await page.getByRole('button', { name: 'Clear this result' }).click();
  await expect(page.getByRole('heading', { name: `Clear ${semi}?` })).toBeVisible();
  await page.getByRole('button', { name: 'Keep result' }).click();
  await expect(page.getByRole('heading', { name: 'Edit score' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear this result' }).click();
  await page.getByRole('button', { name: 'Clear result' }).click();
  await expect(page).toHaveURL(/\/sports\/schedule/);

  await page.goto('/sports/bracket?division=ambassadors');
  await page.getByRole('link', { name: 'Edit score: Quarter-final 2' }).click();
  await page.getByRole('button', { name: 'Clear this result' }).click();
  await expect(page.getByText(/go back to waiting for Quarter-final 2/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/sports-7-clear.png', fullPage: true });
  await page.getByRole('button', { name: 'Clear result' }).click();
  await expect(page).toHaveURL(/\/sports\/schedule/);

  await page.goto('/sports/bracket?division=ambassadors');
  await expect(page.getByRole('link', { name: 'Enter score: Quarter-final 2' })).toBeVisible();
});
