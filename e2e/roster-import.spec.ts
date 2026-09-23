/**
 * End-to-end cover for the roster import screen: upload -> review -> commit.
 *
 * The assertion that matters most is the one in the middle -- that after
 * uploading, the roster is still untouched. ENG-5's whole premise is that
 * nothing imports silently on upload, and this is the only test that exercises
 * that through the real screen rather than through the database function.
 *
 * Needs the local Supabase stack (`npx supabase start`) and an Admin account.
 * Both are created here if absent, so the suite is self-contained: see
 * `ensureAdmin`.
 */

import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import path from 'node:path';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const EMAIL = 'e2e-admin@local.test';
const PASSWORD = 'localdevpassword123';
const FIXTURE = path.join(__dirname, '..', 'supabase', 'fixtures', 'roster-sample.csv');

/**
 * Refuses to run against anything but a local database.
 *
 * This suite truncates `kids` and `registrations` so its row counts are exact.
 * Pointed at the production project -- by a stray env var, or a CI job whose
 * Supabase URL was never changed -- that would delete the real roster. The
 * guard is here, in the code, rather than in CI config, because config is
 * exactly the thing that drifts.
 */
function assertLocalDatabase(): void {
  const host = new URL(DB_URL).hostname;
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';

  if (!isLocal) {
    throw new Error(
      `roster-import.spec.ts deletes roster rows and must only run against a local ` +
        `database, but SUPABASE_DB_URL points at "${host}". Refusing to run.`,
    );
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

/** True when a local Supabase stack is actually up, so the suite can be skipped. */
async function localStackIsRunning(): Promise<boolean> {
  try {
    assertLocalDatabase();
    const res = await fetch(`${AUTH_URL}/auth/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Creates the Admin account if it isn't there, and makes sure it holds the role. */
async function ensureAdmin(): Promise<void> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'E2E Admin', signup_role: 'staff' },
    }),
  }).catch(() => undefined); // already exists is fine

  await withDb(async (client) => {
    await client.query(
      `insert into user_roles (user_id, role)
       select id, 'admin' from auth.users where email = $1
       on conflict do nothing`,
      [EMAIL],
    );
  });
}

/** Clears anything a previous run left, so counts asserted below are exact. */
async function resetRoster(): Promise<void> {
  await withDb(async (client) => {
    await client.query('delete from import_rows');
    await client.query('delete from import_batches');
    await client.query('delete from registrations');
    await client.query('delete from kids');
  });
}

async function countKids(): Promise<number> {
  return withDb(async (client) => {
    const r = await client.query<{ n: string }>('select count(*)::text as n from kids');
    return Number(r.rows[0].n);
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Skipped rather than failed when there is no local stack: a developer running
  // `npm run test:e2e` without `npx supabase start` should get a clear skip, not
  // a connection error they have to decode.
  test.skip(
    !(await localStackIsRunning()),
    'needs a local Supabase stack -- run `npx supabase start` first',
  );

  await ensureAdmin();
});

test('upload, review, and commit a roster', async ({ page }) => {
  await resetRoster();
  await signIn(page);

  // ---- 1 · Empty -------------------------------------------------------
  await page.goto('/admin/imports');
  await expect(page.getByRole('heading', { name: "Import this year's roster" })).toBeVisible();
  await page.screenshot({ path: 'test-results/import-1-empty.png', fullPage: true });

  // ---- 2 · Review ------------------------------------------------------
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect(page.getByRole('heading', { name: 'roster-sample.csv' })).toBeVisible({
    timeout: 20_000,
  });

  // The premise of the whole feature: uploading writes nothing to the roster.
  expect(await countKids()).toBe(0);

  const summary = page.getByText(/rows · .* ready · .* problems/);
  await expect(summary).toBeVisible();

  // The fixture carries three deliberately broken rows.
  await expect(page.getByText('3 problems', { exact: false })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Problem', exact: true })).toHaveCount(3);

  // ...and two rows that repeat an earlier line.
  await expect(page.getByText(/repeat an earlier line/)).toBeVisible();
  await expect(page.getByRole('cell', { name: /also on line/ })).toHaveCount(2);

  await page.screenshot({ path: 'test-results/import-2-review.png', fullPage: true });

  // The filter narrows to just the problems.
  await page.getByRole('button', { name: 'Show only problems' }).click();
  await expect(page.getByRole('row')).toHaveCount(4); // header + 3 problems
  await page.getByRole('button', { name: 'Show only problems' }).click();

  // ---- 3 · Done --------------------------------------------------------
  await page.getByRole('button', { name: /^Import \d+ rows$/ }).click();
  await expect(page.getByRole('heading', { name: 'Roster imported' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/\d+ created, \d+ updated/)).toBeVisible();
  await page.screenshot({ path: 'test-results/import-3-done.png', fullPage: true });

  // Every valid row landed. The fixture's 29 rows are 3 problems plus 2
  // duplicates of earlier lines, so 24 distinct kids.
  expect(await countKids()).toBe(24);

  const committedUrl = page.url();

  // ---- Back to the start ----------------------------------------------
  // "Import another file" used to flash the old review table for a frame on
  // the way out: clearing the summary re-rendered against a `batch` prop that
  // had not changed yet, so the component fell through to the review branch.
  await page.getByRole('button', { name: 'Import another file' }).click();
  await expect(page.getByRole('heading', { name: "Import this year's roster" })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/imports$/);

  // Reloading a committed batch's URL shows what it did, not the review table
  // with a live Import button -- pressing that would fail with "already
  // committed", which is a dead end. The summary is derived from the batch, so
  // it survives a reload rather than living in component state.
  await page.goto(committedUrl);
  await expect(page.getByRole('heading', { name: 'Roster imported' })).toBeVisible();
  // 26 valid rows: 24 new kids, plus the 2 that repeat an earlier line and so
  // update the kid that line created.
  await expect(page.getByText(/24 created, 2 updated/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Import \d+ rows$/ })).toHaveCount(0);
});

test('a non-admin cannot reach the import screen', async ({ page }) => {
  const email = 'e2e-coach@local.test';

  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'E2E Coach', signup_role: 'coach' },
    }),
  }).catch(() => undefined);

  await withDb(async (client) => {
    await client.query(
      `insert into user_roles (user_id, role)
       select id, 'coach' from auth.users where email = $1
       on conflict do nothing`,
      [email],
    );
  });

  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  await page.goto('/admin/imports');

  // Redirected away, and never shown the upload control.
  await expect(page).not.toHaveURL(/\/admin\/imports/);
  await expect(page.getByRole('heading', { name: "Import this year's roster" })).toHaveCount(0);
});
