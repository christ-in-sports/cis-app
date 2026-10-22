/**
 * Admin servants list (ENG-20): an Admin sees a submitted registration, opens the
 * row to every field and can export it; anyone else is sent away from the page.
 *
 * Writes only to three throwaway users it creates, plus the one registration it
 * inserts for the servant (removed with the user). It refuses to run against
 * anything but a local database.
 */

import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const ADMIN = 'e2e-servants-admin@local.test';
const COACH = 'e2e-servants-coach@local.test';
const SERVANT = 'e2e-servants-servant@local.test';
const SERVANT_NAME = 'E2E Listed Servant';
const PASSWORD = 'localdevpassword123';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const host = new URL(DB_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`admin-servants.spec.ts must only run against a local database, not "${host}".`);
  }
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureUser(email: string, roles: string[]): Promise<string> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  }).catch(() => undefined); // already exists is fine

  return withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>('select id from auth.users where email = $1', [email]);
    const id = rows[0].id;
    await client.query('delete from user_roles where user_id = $1', [id]);
    for (const role of roles) {
      await client.query('insert into user_roles (user_id, role) values ($1, $2)', [id, role]);
    }
    return id;
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

test.beforeEach(async () => {
  await ensureUser(ADMIN, ['admin']);
  await ensureUser(COACH, ['coach']);
  const servantId = await ensureUser(SERVANT, []);

  await withDb(async (client) => {
    await client.query('delete from servant_registrations where user_id = $1', [servantId]);
    await client.query(
      `insert into servant_registrations
         (user_id, season_id, full_name, evaluation_status, is_serving, sessions, juniors_subteams,
          email, phone, emergency_contact_name, emergency_contact_phone, gender, dob, home_address)
       select $1, s.id, $2, 'completed', true, array['juniors'], array['coaches'],
              $3, '(510) 555-1234', 'Sara Hanna', '(510) 555-9876', 'male', '1990-04-02',
              '1 Listed St, Hayward, CA'
         from seasons s where s.is_current`,
      [servantId, SERVANT_NAME, SERVANT],
    );
  });
});

test.afterAll(async () => {
  await withDb(async (client) => {
    await client.query(
      'delete from servant_registrations where user_id in (select id from auth.users where email = $1)',
      [SERVANT],
    );
    await client.query(
      'delete from user_roles where user_id in (select id from auth.users where email = any($1))',
      [[ADMIN, COACH]],
    );
  });
});

test('an Admin sees a submitted registration, opens it, and can export', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/servants');

  await expect(page.getByRole('heading', { name: 'Servants' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Registration' });
  await expect(nav.getByRole('link', { name: 'Servants' })).toHaveAttribute('aria-current', 'page');

  const row = page.getByRole('row').filter({ hasText: SERVANT_NAME });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Coaches');
  await expect(row).toContainText('(510) 555-1234');

  // Opening the row shows what the table does not.
  await row.getByRole('button', { name: SERVANT_NAME }).click();
  await expect(page.getByText('1 Listed St, Hayward, CA')).toBeVisible();
  await expect(page.getByText('Sara Hanna, (510) 555-9876')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^cis-servants-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('someone who is not an Admin is sent away from the page', async ({ page }) => {
  await signIn(page, COACH);
  await page.goto('/servants');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(SERVANT_NAME)).toHaveCount(0);
});
