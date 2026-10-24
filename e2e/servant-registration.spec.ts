/**
 * Servant registration (ENG-17/ENG-19): a new servant signs up with the shared
 * code, is sent to the registration form, submits, and edits it. Once an Admin
 * gives them a role they can leave the form for the rest of the app.
 *
 * Writes only to one throwaway user it deletes first and last (the registration
 * goes with it), so no exact counts are needed. It refuses to run against
 * anything but a local database. The confirmation email is stubbed: with no
 * `RESEND_API_KEY` the server skips sending.
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const SERVANT_CODE = process.env.SERVANT_SIGNUP_CODE ?? 'e2e-servant-code';
const EMAIL = 'e2e-servant-form@local.test';
const NAME = 'E2E Servant Form';
const PASSWORD = 'localdevpassword123';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const host = new URL(DB_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`servant-registration.spec.ts must only run against a local database, not "${host}".`);
  }
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const removeServant = () =>
  withDb((client) => client.query('delete from auth.users where email = $1', [EMAIL]));

test.beforeEach(removeServant);
test.afterAll(removeServant);

test('a new servant signs up, is sent to the form, registers, then edits it', async ({ page }) => {
  // 1. Sign up with the shared servant code.
  await page.goto('/signup');
  await page.getByPlaceholder('Servants code sent to you').fill(SERVANT_CODE);
  await page.getByPlaceholder('Your name').fill(NAME);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('At least 10 characters').fill(PASSWORD);
  await page.getByPlaceholder('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: /Sign Up/ }).click();
  await page.waitForURL(/\/(login|servant-registration)/, { timeout: 15_000 });

  // Signup sends them to sign in; sign in if it did not already do that.
  if (new URL(page.url()).pathname === '/login') {
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByPlaceholder('Your password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
  }

  // 2. No role yet, so every area leads to the form.
  await page.waitForURL(/\/servant-registration$/, { timeout: 15_000 });
  await page.goto('/sports');
  await expect(page).toHaveURL(/\/servant-registration$/);
  await expect(page.getByRole('heading', { name: 'Servant registration' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue(EMAIL);

  // The session and team questions are hidden until the servant says "Yes".
  await expect(page.getByText('Which sessions can you serve?')).toBeHidden();

  // 3. Submit. The real inputs are visually hidden; the label is what a thumb taps.
  await page.getByLabel('Name', { exact: true }).fill(NAME);
  await page.locator('label').filter({ hasText: 'Not Completed' }).click();
  await page.locator('label').filter({ hasText: /^Yes$/ }).click();
  await page.locator('label').filter({ hasText: /^Juniors$/ }).click();
  await page.locator('label').filter({ hasText: 'Coaches' }).click();
  await page.getByLabel('Phone', { exact: true }).fill('510-555-1234');
  await page.locator('label').filter({ hasText: /^Male$/ }).click();
  await page.getByLabel('Date of birth').fill('1990-04-02');
  await page.getByLabel('Home address').fill('1 Main St, Hayward, CA');
  await page.getByLabel('Emergency contact name').fill('Sara Hanna');
  await page.getByLabel('Emergency contact phone').fill('510-555-9876');
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByText('You are registered')).toBeVisible();

  const saved = await withDb(async (client) =>
    (
      await client.query(
        `select r.is_serving, r.sessions, r.juniors_subteams, r.phone, r.email
           from servant_registrations r join auth.users u on u.id = r.user_id
          where u.email = $1`,
        [EMAIL],
      )
    ).rows,
  );
  expect(saved).toEqual([
    {
      is_serving: true,
      sessions: ['juniors'],
      juniors_subteams: ['coaches'],
      phone: '(510) 555-1234',
      email: EMAIL,
    },
  ]);

  // 4. Edit: the answers are still there, and saving updates the same row.
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(NAME);
  await expect(page.getByText(/Last saved/)).toBeVisible();
  await page.getByLabel(/Dates you will miss/).fill('Feb 7 and Feb 14');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved')).toBeVisible();

  const rows = await withDb(async (client) =>
    (
      await client.query(
        `select r.dates_missing from servant_registrations r
           join auth.users u on u.id = r.user_id where u.email = $1`,
        [EMAIL],
      )
    ).rows,
  );
  expect(rows).toEqual([{ dates_missing: 'Feb 7 and Feb 14' }]);
});

test('a servant who already has a role is not sent to the form', async ({ page }) => {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  // A role is the only thing the gate looks at.
  await withDb((client) =>
    client.query(
      `insert into user_roles (user_id, role) select id, 'coach' from auth.users where email = $1`,
      [EMAIL],
    ),
  );

  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  await expect(page).toHaveURL(/\/$/);
  // Today, not the form: a Coach gets the app, and the form is a row in More.
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Servant registration' })).toHaveCount(0);
});
