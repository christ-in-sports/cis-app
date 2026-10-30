/**
 * End-to-end cover for the parent join link (ENG-31).
 *
 * The unit tests mock Supabase; this is the only place the whole path runs: the
 * link, the real Auth server sending the code (read back from the local mail
 * catcher, Mailpit), the role being granted, and what a Parent can and cannot
 * open afterwards. It also checks the other side of the rule: a wrong code gives
 * no way in, and Parent is the only role the link can grant.
 *
 * Needs the local Supabase stack (`npx supabase start`) and an app built against
 * it -- see `roster-import.spec.ts` for why `NEXT_PUBLIC_SUPABASE_*` must point at
 * the local stack when this runs outside CI. The app is started with
 * `PARENT_JOIN_CODE` set by `playwright.config.ts`.
 */

import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const MAIL_URL = process.env.SUPABASE_MAIL_URL ?? 'http://127.0.0.1:54324';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const JOIN_CODE = process.env.PARENT_JOIN_CODE ?? 'e2e-parent-code';
const JOIN_URL = `/join?code=${JOIN_CODE}`;
const PASSWORD = 'localdevpassword123';

// One account per test: Auth will not send a second code to the same address
// within `max_frequency` (1s locally, 60s hosted), and the tests run back to back.
const NEW_PARENT = 'e2e-join-new@local.test';
const WRONG_CODE_PARENT = 'e2e-join-wrong@local.test';
const COACH = 'e2e-join-coach@local.test';
const EXISTING_PARENT = 'e2e-join-existing@local.test';

/** Refuses to run against anything but a local database; see `roster-import.spec.ts`. */
function assertLocalDatabase(): void {
  const host = new URL(DB_URL).hostname;
  if (!(host === '127.0.0.1' || host === 'localhost' || host === '::1')) {
    throw new Error(`Refusing to run e2e against a non-local database (${host})`);
  }
}

async function localStackIsRunning(): Promise<boolean> {
  try {
    assertLocalDatabase();
    const [auth, mail] = await Promise.all([
      fetch(`${AUTH_URL}/auth/v1/health`),
      fetch(`${MAIL_URL}/api/v1/messages`),
    ]);
    return auth.ok && mail.ok;
  } catch {
    return false;
  }
}

async function withDb<T>(work: (client: Client) => Promise<T>): Promise<T> {
  assertLocalDatabase();
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function ensureUser(email: string, role: string | null): Promise<void> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  }).catch(() => undefined); // already exists is fine

  await withDb(async (client) => {
    await client.query(
      `delete from user_roles where user_id = (select id from auth.users where email = $1)`,
      [email],
    );
    if (role) {
      await client.query(
        `insert into user_roles (user_id, role)
         select id, $2::app_role from auth.users where email = $1`,
        [email, role],
      );
    }
  });
}

async function rolesOf(email: string): Promise<string[]> {
  return withDb(async (client) => {
    const r = await client.query<{ role: string }>(
      `select role from user_roles
        where user_id = (select id from auth.users where email = $1) order by role`,
      [email],
    );
    return r.rows.map((row) => row.role);
  });
}

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

async function clearMail(): Promise<void> {
  await fetch(`${MAIL_URL}/api/v1/messages`, { method: 'DELETE' });
}

/** The 6-digit code in the newest email to this address, once it has arrived. */
async function codeSentTo(address: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const list = (await (await fetch(`${MAIL_URL}/api/v1/messages`)).json()) as {
          messages: MailSummary[];
        };
        const newest = list.messages.find((m) => m.To.some((t) => t.Address === address));
        if (!newest) return undefined;
        const message = (await (await fetch(`${MAIL_URL}/api/v1/message/${newest.ID}`)).json()) as {
          Text: string;
        };
        code = message.Text.match(/\b\d{6}\b/)?.[0];
        return code;
      },
      { timeout: 15_000, message: `no email with a code reached ${address}` },
    )
    .toBeDefined();
  return code!;
}

async function signInWithPassword(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(
    !(await localStackIsRunning()),
    'needs a local Supabase stack -- run `npx supabase start` first',
  );
  await withDb((client) =>
    client.query('delete from auth.users where email = any($1)', [[NEW_PARENT, WRONG_CODE_PARENT]]),
  );
  await ensureUser(COACH, 'coach');
  await ensureUser(EXISTING_PARENT, 'parent');
});

test.beforeEach(async () => {
  await clearMail();
});

// The hosted project has "Allow new users to sign up" off, so accounts only ever
// come from the server (servant signup, this link). The local stack is set the
// same way (`[auth] enable_signup = false`); if that drifts, the join flow would
// pass here and fail in production, which is how ENG-31 first broke.
test('Auth itself refuses signups, so an account can only come from the server', async () => {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const res = await fetch(`${AUTH_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'e2e-join-direct@local.test', create_user: true }),
  });

  expect(res.status).toBe(422);
  expect(((await res.json()) as { error_code: string }).error_code).toBe('signup_disabled');
  const made = await withDb((client) =>
    client.query('select 1 from auth.users where email = $1', ['e2e-join-direct@local.test']),
  );
  expect(made.rowCount).toBe(0);
});

test('a wrong or missing code shows a notice and no way to join', async ({ page }) => {
  for (const path of ['/join?code=not-the-code', '/join']) {
    await page.goto(path);

    await expect(page.getByText('This link has changed')).toBeVisible();
    await expect(page.getByText('Use the latest link from the parent group chat.')).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveCount(0);
    await expect(page.getByLabel('Email')).toHaveCount(0);
  }
});

test('a new parent joins with the link, gets only Parent, and never sees servant screens', async ({ page }) => {
  await page.goto(JOIN_URL);
  await page.getByLabel('Your name').fill('Mariam Guirguis');
  await page.getByLabel('Email').fill(NEW_PARENT);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();

  const code = await codeSentTo(NEW_PARENT);
  await page.getByLabel('6-digit code').fill(code);

  await page.waitForURL((url) => url.pathname === '/register', { timeout: 15_000 });
  expect(await rolesOf(NEW_PARENT)).toEqual(['parent']);
  const profile = await withDb((client) =>
    client.query(`select display_name from profiles where email = $1`, [NEW_PARENT]),
  );
  expect(profile.rows[0].display_name).toBe('Mariam Guirguis');

  // A parent's app has no servant screens.
  const app = page.getByRole('navigation', { name: 'App' });
  await expect(app.getByRole('link')).toHaveText(['Today', 'Sports', 'More']);
  await page.goto('/servant-registration');
  await expect(page).toHaveURL(/\/$/);
});

test('a wrong emailed code grants nothing', async ({ page }) => {
  await page.goto(JOIN_URL);
  await page.getByLabel('Your name').fill('Mariam Guirguis');
  await page.getByLabel('Email').fill(WRONG_CODE_PARENT);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const real = await codeSentTo(WRONG_CODE_PARENT);

  await page.getByLabel('6-digit code').fill(real === '000000' ? '111111' : '000000');

  await expect(page.getByText('That code did not work')).toBeVisible();
  await expect(page).toHaveURL(/\/join/);
  expect(await rolesOf(WRONG_CODE_PARENT)).toEqual([]);
});

test('a servant who is also a parent adds Parent to their own account with one tap', async ({ page }) => {
  await signInWithPassword(page, COACH);
  await page.goto(JOIN_URL);

  await expect(page.getByText(COACH)).toBeVisible();
  await page.getByRole('button', { name: 'Join as a parent' }).click();

  await page.waitForURL((url) => url.pathname === '/register', { timeout: 15_000 });
  expect(await rolesOf(COACH)).toEqual(['coach', 'parent']);
});

test('someone who is already a parent goes straight to registration', async ({ page }) => {
  await signInWithPassword(page, EXISTING_PARENT);
  await page.goto(JOIN_URL);

  await expect(page).toHaveURL(/\/register/);
});

test('a signed-in person with a wrong code gets no Parent role', async ({ page }) => {
  await ensureUser(COACH, 'coach');
  await signInWithPassword(page, COACH);
  await page.goto('/join?code=not-the-code');

  await expect(page.getByText('This link has changed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join as a parent' })).toHaveCount(0);
  expect(await rolesOf(COACH)).toEqual(['coach']);
});
