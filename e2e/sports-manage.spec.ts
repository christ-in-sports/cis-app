/**
 * Managing a sport block as Program Team (ENG-15 part 3): create a block, see why
 * fixtures are locked with too few teams, generate fixtures, schedule and clear a
 * game day, edit a block with games (its sport is locked), and reset it.
 *
 * Generating fixtures uses every team in the division, so the counts it asserts
 * need a season with exactly the teams it creates. It therefore makes its own
 * season, makes it the current one for the run, and puts the previous current
 * season back afterwards. It refuses to run against anything but a local database.
 */

import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const PROGRAM = 'e2e-manage-program@local.test';
const COACH = 'e2e-manage-coach@local.test';
const PASSWORD = 'localdevpassword123';

const JUNIORS = ['Lions', 'Falcons', 'Eagles', 'Hawks', 'Comets', 'Warriors', 'Rams', 'Anchors'].map((n) => `E2E ${n}`);
const AMBASSADORS = ['Saints', 'Kings', 'Titans', 'Pilgrims'].map((n) => `E2E ${n}`);

function assertLocalDatabase(): void {
  const host = new URL(DB_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`sports-manage.spec.ts writes sport blocks and must only run against a local database, not "${host}".`);
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

async function ensureUser(email: string, role: string): Promise<void> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  }).catch(() => undefined);
  await withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>('select id from auth.users where email = $1', [email]);
    await client.query('insert into user_roles (user_id, role) values ($1, $2) on conflict do nothing', [rows[0].id, role]);
  });
}

const SEASON_NAME = 'E2E manage season';
let previousCurrent: string[] = [];

async function removeSeason(client: Client): Promise<void> {
  const { rows } = await client.query<{ id: string }>('select id from seasons where name = $1', [SEASON_NAME]);
  for (const { id } of rows) {
    await client.query('delete from sport_blocks where season_id = $1', [id]);
    await client.query('delete from ministry_teams where season_id = $1', [id]);
    await client.query('delete from seasons where id = $1', [id]);
  }
}

async function cleanup(): Promise<void> {
  await withDb(async (client) => {
    await removeSeason(client);
    if (previousCurrent.length > 0) {
      await client.query('update seasons set is_current = true where id = any($1)', [previousCurrent]);
      previousCurrent = [];
    }
  });
}

async function seed(): Promise<void> {
  await withDb(async (client) => {
    await removeSeason(client);
    previousCurrent = (await client.query<{ id: string }>('select id from seasons where is_current')).rows.map((r) => r.id);
    await client.query('update seasons set is_current = false where is_current');
    const season = (
      await client.query<{ id: string }>(
        `insert into seasons (name, is_current, starts_on, ends_on) values ($1, true, '2026-10-12', '2026-12-07') returning id`,
        [SEASON_NAME]
      )
    ).rows[0].id;
    for (const [division, names] of [['juniors', JUNIORS], ['ambassadors', AMBASSADORS]] as const) {
      for (const name of names) {
        await client.query(`insert into ministry_teams (name, division, season_id) values ($1, $2, $3)`, [name, division, season]);
      }
    }
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
  await ensureUser(PROGRAM, 'program');
  await ensureUser(COACH, 'coach');
  await seed();
});

test.afterAll(async () => {
  if (await localStackIsRunning()) await cleanup();
});

test('a coach is sent away from Manage', async ({ page }) => {
  await signIn(page, COACH);
  await page.goto('/sports/manage');
  await expect(page).toHaveURL(/\/sports$/);
  await page.goto('/sports/manage/new');
  await expect(page).toHaveURL(/\/sports$/);
});

test('Program Team creates, fills, schedules, clears, edits and resets a block', async ({ page }) => {
  await signIn(page, PROGRAM);

  // ---- Too few teams: the reason is shown, and nothing can be generated ------
  await page.goto('/sports/manage?division=ambassadors');
  await expect(page.getByRole('navigation', { name: 'Sports' }).getByRole('link', { name: 'Manage' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Nothing set up yet' })).toBeVisible();
  await page.getByRole('link', { name: 'New block' }).click();
  await expect(page.getByRole('heading', { name: 'New block' })).toBeVisible();
  await page.getByRole('button', { name: 'Create block' }).click();
  await expect(page.getByRole('heading', { name: 'Ambassadors soccer' })).toBeVisible();
  await expect(page.getByText('Add 2 more teams to Ambassadors')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate fixtures' })).toBeDisabled();
  await expect(page.getByText('Needs at least 6 teams. This division has 4.')).toBeVisible();
  await page.screenshot({ path: 'test-results/manage-1-empty.png', fullPage: true });

  // ---- Create a league-only basketball block for the 8 Juniors ---------------
  await page.goto('/sports/manage?division=juniors');
  await page.getByRole('link', { name: 'New block' }).click();
  await page.getByText('Basketball', { exact: true }).click();
  await page.getByText('League only', { exact: true }).click();
  await page.screenshot({ path: 'test-results/manage-2-form.png', fullPage: true });
  await page.getByRole('button', { name: 'Create block' }).click();
  await expect(page.getByRole('heading', { name: 'Juniors basketball' })).toBeVisible();
  await expect(page.getByText('League only · One table')).toBeVisible();
  await expect(page.getByText('8 teams in one table makes 28 games. Each team plays 7.')).toBeVisible();

  // ---- Generate fixtures ------------------------------------------------------
  await page.getByRole('button', { name: 'Generate fixtures' }).click();
  await expect(page.getByRole('status')).toContainText('28 fixtures generated');
  await expect(page.getByText('Schedule a game day').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate fixtures' })).toHaveCount(0);

  // ---- Schedule a game day, with its capacity shown first --------------------
  await page.getByRole('link', { name: 'Schedule a game day' }).click();
  await page.getByLabel('Date').fill('2026-10-17');
  await page.getByLabel('Slots').fill('3');
  await expect(page.getByText('3 slots × 2 courts = 6 games. 28 games have no time yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Schedule day' }).click();
  await expect(page.getByRole('status')).toContainText('6 games placed, 22 left to schedule');
  await page.screenshot({ path: 'test-results/manage-3-scheduled.png', fullPage: true });
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByText('scheduled', { exact: true })).toBeVisible();

  // ---- Clear it again ---------------------------------------------------------
  await page.getByRole('link', { name: 'Clear a game day' }).click();
  await expect(page.getByText('6 games on Saturday, Oct 17 go back to unscheduled')).toBeVisible();
  await page.getByRole('button', { name: 'Clear game day' }).click();
  await expect(page.getByRole('status')).toContainText('6 games cleared');
  await page.getByRole('link', { name: 'Done' }).click();

  // ---- Edit: sport, division and format are locked once there are games ------
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByText(/locked because this block has 28 games/)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Soccer' })).toHaveCount(0);
  await page.getByLabel('End date').fill('2026-12-14');
  await page.screenshot({ path: 'test-results/manage-4-edit-locked.png', fullPage: true });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Juniors basketball' })).toBeVisible();
  await expect(page.getByText(/Dec 14/)).toBeVisible();
  // Saving never touched the fixtures.
  await expect(page.getByText('28', { exact: true }).first()).toBeVisible();

  // ---- Reset names what goes, and needs a tick -------------------------------
  await page.getByRole('link', { name: 'Reset block' }).click();
  await expect(page.getByRole('heading', { name: 'Reset Juniors basketball?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset block' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/manage-5-reset.png', fullPage: true });
  await page.getByText('I understand these results cannot be recovered').click();
  await page.getByRole('button', { name: 'Reset block' }).click();
  await expect(page.getByText('Generate fixtures').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reset block' })).toHaveCount(0);
});
