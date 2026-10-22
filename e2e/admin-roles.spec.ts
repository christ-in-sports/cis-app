/**
 * Role assignment (ENG-16): a new servant signs up with no role and sees nothing,
 * an Admin grants them Coach on /admin/roles, and they can then open Attendance.
 *
 * Writes only to two throwaway users it creates (and clears their roles at the
 * end), so unlike the roster and sports specs it needs no exact counts. It still
 * refuses to run against anything but a local database.
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import { Client } from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const ADMIN = 'e2e-roles-admin@local.test';
const SERVANT = 'e2e-roles-servant@local.test';
const SERVANT_NAME = 'E2E Roles Servant';
const PASSWORD = 'localdevpassword123';

function assertLocalDatabase(): void {
  const host = new URL(DB_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`admin-roles.spec.ts must only run against a local database, not "${host}".`);
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

async function ensureUser(email: string, displayName: string): Promise<string> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: displayName } }),
  }).catch(() => undefined); // already exists is fine

  return withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>('select id from auth.users where email = $1', [email]);
    return rows[0].id;
  });
}

async function setRoles(userId: string, roles: string[]): Promise<void> {
  await withDb(async (client) => {
    await client.query('delete from user_roles where user_id = $1', [userId]);
    for (const role of roles) {
      await client.query('insert into user_roles (user_id, role) values ($1, $2)', [userId, role]);
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

async function signedInPage(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

const KID = 'e2e-roles-kid@local.test';
const KID_NAME = 'E2E Roles Kid';

let adminId: string;
let servantId: string;
let kidId: string;

test.beforeEach(async () => {
  adminId = await ensureUser(ADMIN, 'E2E Roles Admin');
  servantId = await ensureUser(SERVANT, SERVANT_NAME);
  kidId = await ensureUser(KID, KID_NAME);
  await setRoles(adminId, ['admin']);
  await setRoles(servantId, []);
  await setRoles(kidId, ['kid']);
});

test.afterAll(async () => {
  if (adminId) await setRoles(adminId, []);
  if (servantId) await setRoles(servantId, []);
  if (kidId) await setRoles(kidId, []);
});

test('an Admin gives a new servant the Coach role, and they can then open Attendance', async ({ page, browser }) => {
  // Before: a roleless servant is sent from Attendance to the registration form.
  const servantPage = await signedInPage(browser, SERVANT);
  await servantPage.goto('/attendance');
  await expect(servantPage).toHaveURL(/\/servant-registration$/);

  // The Admin finds them under "no role yet" and ticks Coach.
  await signIn(page, ADMIN);
  await page.goto('/admin/roles');
  const row = page.getByRole('region', { name: SERVANT_NAME });
  await expect(row).toBeVisible();
  await expect(row.getByText('No role yet')).toBeVisible();

  // The real input is visually hidden; the label is what a thumb taps.
  const coachBox = row.getByRole('checkbox', { name: `Coach for ${SERVANT_NAME}` });
  await row.locator('label').filter({ hasText: 'Coach' }).click();
  await expect(coachBox).toBeChecked();
  await expect(row.getByText('No role yet')).toBeHidden();

  await expect
    .poll(() =>
      withDb(async (client) => {
        const { rows } = await client.query(
          `select granted_by from user_roles where user_id = $1 and role = 'coach'`,
          [servantId],
        );
        return rows[0]?.granted_by ?? null;
      }),
    )
    .toBe(adminId);

  // After: the same servant now reaches Attendance.
  await servantPage.goto('/attendance');
  await expect(servantPage.getByText('No Access')).toBeHidden();
  await expect(servantPage.getByRole('link', { name: 'Summary', exact: true })).toBeVisible();

  // And the Admin can take it away again.
  await row.locator('label').filter({ hasText: 'Coach' }).click();
  await expect(coachBox).not.toBeChecked();
  await expect
    .poll(() =>
      withDb(async (client) =>
        (await client.query('select 1 from user_roles where user_id = $1', [servantId])).rowCount,
      ),
    )
    .toBe(0);
});

test('the screen is for servants: no Kid box, and kid accounts are not listed', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/admin/roles');

  await expect(page.getByRole('region', { name: SERVANT_NAME })).toBeVisible();
  await expect(page.getByRole('region', { name: KID_NAME })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /^Kid for/ })).toHaveCount(0);
});

test("an Admin can't untick their own Admin box", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/admin/roles');

  const own = page.getByRole('checkbox', { name: 'Admin for E2E Roles Admin' });
  await expect(own).toBeChecked();
  await expect(own).toBeDisabled();
  await expect(page.getByText("You can't remove your own Admin role")).toBeVisible();
});

test('someone who is not an Admin is sent away from the roles screen', async ({ page }) => {
  await setRoles(servantId, ['coach']);
  await signIn(page, SERVANT);

  await page.goto('/admin/roles');

  await expect(page).not.toHaveURL(/\/admin\/roles/);
});
