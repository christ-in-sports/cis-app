/**
 * End-to-end cover for signing in with an emailed code (ENG-28).
 *
 * The component tests mock Supabase; this is the only place the whole path runs
 * against the real Auth server: `/login` asks for a code, Auth sends the email
 * (read back from the local mail catcher, Mailpit), the code signs the person in,
 * and an address with no account neither gets an account nor an email.
 *
 * Needs the local Supabase stack (`npx supabase start`) and an app built against
 * it -- see `roster-import.spec.ts` for why `NEXT_PUBLIC_SUPABASE_*` must point at
 * the local stack when this runs outside CI.
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const MAIL_URL = process.env.SUPABASE_MAIL_URL ?? 'http://127.0.0.1:54324';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// One account per test: Auth will not send a second code to the same address
// within `max_frequency` (1s locally, 60s hosted), and the tests run back to back.
const MEMBER_EMAIL = 'e2e-code-member@local.test';
const WRONG_CODE_EMAIL = 'e2e-code-wrong@local.test';
const STRANGER_EMAIL = 'e2e-code-stranger@local.test';

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

async function ensureMember(email: string): Promise<void> {
  await fetch(`${AUTH_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: 'localdevpassword123', email_confirm: true }),
  }).catch(() => undefined); // already exists is fine

  await withDb((client) =>
    client.query(
      `insert into user_roles (user_id, role)
       select id, 'parent'::app_role from auth.users where email = $1
       on conflict do nothing`,
      [email],
    ),
  );
}

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

async function mailTo(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAIL_URL}/api/v1/messages`);
  const body = (await res.json()) as { messages: MailSummary[] };
  return body.messages.filter((m) => m.To.some((t) => t.Address === address));
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
        const [newest] = await mailTo(address); // Mailpit lists newest first
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

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(
    !(await localStackIsRunning()),
    'needs a local Supabase stack -- run `npx supabase start` first',
  );
  await ensureMember(MEMBER_EMAIL);
  await ensureMember(WRONG_CODE_EMAIL);
  await withDb((client) =>
    client.query('delete from auth.users where email = $1', [STRANGER_EMAIL]),
  );
});

test.beforeEach(async ({ page }) => {
  await clearMail();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
});

async function askForCode(page: import('@playwright/test').Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
}

test('an existing account signs in with the emailed code', async ({ page }) => {
  await askForCode(page, MEMBER_EMAIL);
  const code = await codeSentTo(MEMBER_EMAIL);

  await page.getByLabel('6-digit code').fill(code);

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'More' })).toBeVisible();
});

test('a wrong code is refused and the person stays on the login page', async ({ page }) => {
  await askForCode(page, WRONG_CODE_EMAIL);
  const real = await codeSentTo(WRONG_CODE_EMAIL);
  const wrong = real === '000000' ? '111111' : '000000';

  await page.getByLabel('6-digit code').fill(wrong);

  await expect(page.getByText('That code did not work')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel('6-digit code')).toHaveValue('');
});

test('an address with no account gets no email and no account', async ({ page }) => {
  await askForCode(page, STRANGER_EMAIL);

  // The page answers the same as for a real account, so it reveals nothing.
  await expect(page.getByText(STRANGER_EMAIL)).toBeVisible();

  await page.waitForTimeout(2_000); // long enough for an email to have been delivered
  expect(await mailTo(STRANGER_EMAIL)).toHaveLength(0);
  const created = await withDb((client) =>
    client.query('select 1 from auth.users where email = $1', [STRANGER_EMAIL]),
  );
  expect(created.rowCount).toBe(0);
});
