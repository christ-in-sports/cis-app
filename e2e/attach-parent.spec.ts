/**
 * Attaching a CSV-imported kid to a parent account (ENG-30).
 *
 * The CSV import is the backup for families who filled in the Google Form instead
 * of using the app. Those kids have no parent, so only an Admin can see them. The
 * app never links a kid by matching an email (ENG-29), so an Admin does it on
 * /registrations: type the parent's email, read back who it is, confirm. Then the
 * parent finds the kid on /register.
 *
 * Writes only to throwaway users and one kid it creates and removes. It refuses
 * to run against anything but a local database.
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import { Client } from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const ADMIN = 'e2e-attach-admin@local.test';
const PARENT = 'e2e-attach-parent@local.test';
const PARENT_NAME = 'E2E Attach Parent';
const COACH = 'e2e-attach-coach@local.test';
const GUARDIAN_EMAIL = 'e2e-attach-guardian@local.test'; // on the form, but no account has it
const PASSWORD = 'localdevpassword123';

function assertLocalDatabase(): void {
  const host = new URL(DB_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`attach-parent.spec.ts must only run against a local database, not "${host}".`);
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

async function ensureUser(email: string, displayName: string, role: string): Promise<string> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: displayName } }),
  }).catch(() => undefined); // already exists is fine

  return withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>('select id from auth.users where email = $1', [email]);
    const id = rows[0].id;
    await client.query('delete from user_roles where user_id = $1', [id]);
    await client.query('insert into user_roles (user_id, role) values ($1, $2::app_role)', [id, role]);
    return id;
  });
}

/** Zed, as the CSV import leaves a kid: a registration for this season, and no parent. */
async function resetKid(): Promise<void> {
  await withDb(async (client) => {
    await client.query(`delete from kids where last_name = 'Attachson'`);
    const kid = await client.query<{ id: string }>(
      `insert into kids (
         first_name, last_name, dob, gender, home_address,
         emergency_contact_name, emergency_contact_phone,
         guardian_name, guardian_phone, guardian_email
       ) values ('Zed','Attachson','2013-04-04','male','2 Church Way, Hayward, CA',
                 'Pat Attachson','(510) 555-0140','Pat Attachson','(510) 555-0141',$1)
       returning id`,
      [GUARDIAN_EMAIL],
    );
    await client.query(
      `insert into registrations (kid_id, season_id, grade, division, tshirt_size, source)
       select $1, id, 6, 'juniors', 'YM', 'import' from seasons where is_current`,
      [kid.rows[0].id],
    );
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

const zedParent = () =>
  withDb(async (client) => {
    const { rows } = await client.query<{ parent_user_id: string | null }>(
      `select parent_user_id from kids where last_name = 'Attachson'`,
    );
    return rows[0]?.parent_user_id ?? null;
  });

let parentId: string;

test.beforeAll(async () => {
  test.skip(!(await localStackIsRunning()), 'needs a local Supabase stack -- run `npx supabase start` first');
  await ensureUser(ADMIN, 'E2E Attach Admin', 'admin');
  parentId = await ensureUser(PARENT, PARENT_NAME, 'parent');
  await ensureUser(COACH, 'E2E Attach Coach', 'coach');
});

test.afterAll(async () => {
  if (await localStackIsRunning()) {
    await withDb((client) => client.query(`delete from kids where last_name = 'Attachson'`));
  }
});

test('an Admin attaches an imported kid to a parent, who then finds them on Register', async ({ page, browser }) => {
  await resetKid();

  // The parent cannot see Zed yet: an email on a form is not a link.
  const parentPage = await signedInPage(browser, PARENT);
  await parentPage.goto('/register');
  await expect(parentPage.getByRole('button', { name: /Zed Attachson/ })).toHaveCount(0);

  await signIn(page, ADMIN);
  await page.goto('/registrations');
  await page.getByRole('button', { name: 'Attachson, Zed' }).click();
  await expect(page.getByText('Not attached', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Attach to parent' }).click();

  // The guardian email from the form is only a suggestion, and no account has it.
  const email = page.getByLabel(/Parent's email/);
  await expect(email).toHaveValue(GUARDIAN_EMAIL);
  await page.getByRole('button', { name: 'Find parent' }).click();
  await expect(page.getByText('No account has that email')).toBeVisible();

  // An account that is not a Parent is not matched, so a servant is never given a kid.
  await email.fill(COACH);
  await page.getByRole('button', { name: 'Find parent' }).click();
  await expect(page.getByText(/not a Parent/)).toBeVisible();
  expect(await zedParent()).toBeNull();

  // The Admin reads the parent back before anything is written.
  await email.fill(`  ${PARENT.toUpperCase()} `);
  await page.getByRole('button', { name: 'Find parent' }).click();
  await expect(page.getByText(PARENT_NAME)).toBeVisible();
  await expect(page.getByText(/address, emergency contact, photo and payments/)).toBeVisible();
  expect(await zedParent()).toBeNull();

  await page.getByRole('button', { name: 'Attach', exact: true }).click();
  await expect(page.getByText('Attached', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach to parent' })).toHaveCount(0);
  expect(await zedParent()).toBe(parentId);

  // The parent now finds Zed, to finish the waiver and photo.
  await parentPage.goto('/register');
  await expect(parentPage.getByRole('button', { name: /Zed Attachson/ })).toBeVisible();
  await parentPage.context().close();
});

test('a kid who already has a parent offers nothing to attach', async ({ page }) => {
  await resetKid();
  await withDb((client) =>
    client.query(`update kids set parent_user_id = $1 where last_name = 'Attachson'`, [parentId]),
  );

  await signIn(page, ADMIN);
  await page.goto('/registrations');
  await page.getByRole('button', { name: 'Attachson, Zed' }).click();

  await expect(page.getByText('Attached', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach to parent' })).toHaveCount(0);
});
