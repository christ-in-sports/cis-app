/**
 * End-to-end cover for the parent registration screen (ENG-4).
 *
 * The component tests mock the Server Action, and the database tests call
 * `register_kid()` directly; this is the only place the whole path runs
 * together -- real sign-in, the page reading kids through RLS, the form, the
 * Server Action, the database function, and back. Two things are checked at the
 * database rather than on screen, because they are the point of the design:
 * consent is stamped with the signed-in parent, and a CSV-imported kid keeps its
 * `import` source when the parent completes it.
 *
 * Needs the local Supabase stack (`npx supabase start`) and an app built against
 * it -- see `roster-import.spec.ts` for why `NEXT_PUBLIC_SUPABASE_*` must point
 * at the local stack when this runs outside CI.
 */

import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const AUTH_URL = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const PARENT_EMAIL = 'e2e-parent@local.test';
const OUTSIDER_EMAIL = 'e2e-outsider@local.test';
const PASSWORD = 'localdevpassword123';

/** Refuses to run against anything but a local database; see `roster-import.spec.ts`. */
function assertLocalDatabase(): void {
  const host = new URL(DB_URL).hostname;
  if (!(host === '127.0.0.1' || host === 'localhost' || host === '::1')) {
    throw new Error(
      `parent-registration.spec.ts writes kids and registrations and must only run against ` +
        `a local database, but SUPABASE_DB_URL points at "${host}". Refusing to run.`,
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

async function localStackIsRunning(): Promise<boolean> {
  try {
    assertLocalDatabase();
    return (await fetch(`${AUTH_URL}/auth/v1/health`)).ok;
  } catch {
    return false;
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

  if (role) {
    await withDb((client) =>
      client.query(
        `insert into user_roles (user_id, role)
         select id, $2::app_role from auth.users where email = $1
         on conflict do nothing`,
        [email, role],
      ),
    );
  }
}

/**
 * Leaves the parent with exactly one kid: Mina, as a CSV import would have --
 * no linked parent yet, and a registration with no consent. The page has to link
 * her by guardian email, which is part of what this run proves.
 *
 * Scoped to this parent's own rows, so it never touches anyone else's data.
 */
async function resetParentData(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `delete from kids
        where guardian_email = $1
           or parent_user_id in (select id from auth.users where email = $1)`,
      [PARENT_EMAIL],
    );

    const kid = await client.query<{ id: string }>(
      `insert into kids (
         first_name, last_name, dob, gender, home_address,
         emergency_contact_name, emergency_contact_phone,
         guardian_name, guardian_phone, guardian_email
       ) values ('Mina','Guirguis','2014-03-02','male','1 Church Way, Hayward, CA',
                 'Peter Guirguis','(510) 555-0122','Mariam Guirguis','(510) 555-0111',$1)
       returning id`,
      [PARENT_EMAIL],
    );
    await client.query(
      `insert into registrations (kid_id, season_id, grade, division, tshirt_size, source)
       select $1, id, 6, 'juniors', 'YM', 'import' from seasons where is_current`,
      [kid.rows[0].id],
    );
  });
}

interface StoredRegistration {
  first_name: string;
  parent_user_id: string | null;
  grade: number;
  division: string;
  tshirt_size: string;
  source: string;
  consent_given_at: Date | null;
  consent_by_user_id: string | null;
}

async function registrationFor(firstName: string): Promise<StoredRegistration | undefined> {
  return withDb(async (client) => {
    const r = await client.query<StoredRegistration>(
      `select k.first_name, k.parent_user_id, r.grade, r.division, r.tshirt_size, r.source,
              r.consent_given_at, r.consent_by_user_id
         from kids k
         join registrations r on r.kid_id = k.id
         join seasons s on s.id = r.season_id and s.is_current
        where k.guardian_email = $1 and k.first_name = $2`,
      [PARENT_EMAIL, firstName],
    );
    return r.rows[0];
  });
}

async function parentId(): Promise<string> {
  return withDb(async (client) => {
    const r = await client.query<{ id: string }>('select id from auth.users where email = $1', [
      PARENT_EMAIL,
    ]);
    return r.rows[0].id;
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
  test.skip(
    !(await localStackIsRunning()),
    'needs a local Supabase stack -- run `npx supabase start` first',
  );

  await ensureUser(PARENT_EMAIL, 'parent');
  await ensureUser(OUTSIDER_EMAIL, null);
  await resetParentData();
});

test('a signed-out visitor is sent to log in', async ({ page }) => {
  await page.goto('/register');

  await expect(page).toHaveURL(/\/login\?redirect=%2Fregister/);
});

test('someone who is not a parent gets no registration form', async ({ page }) => {
  await signIn(page, OUTSIDER_EMAIL);
  await page.goto('/register');

  await expect(page.getByRole('heading', { name: 'Registration is for parents' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register' })).toHaveCount(0);
  await expect(page.getByLabel('First name')).toHaveCount(0);
});

test('a parent completes an imported kid, then registers a new one', async ({ page }) => {
  await resetParentData();
  await signIn(page, PARENT_EMAIL);
  await page.goto('/register');

  // ---- The imported kid was linked by guardian email, and is not finished ----
  await expect(page.getByRole('heading', { name: 'Who are you registering?' })).toBeVisible();
  const mina = page.getByRole('button', { name: /Mina Guirguis/ });
  await expect(mina).toContainText('Grade 6 · Waiver needed');
  await expect(mina).toContainText('Finish');
  await page.screenshot({ path: 'test-results/register-1-picker.png', fullPage: true });

  // ---- Complete her: identity is locked, the waiver is required ---------------
  await mina.click();
  await expect(page.getByRole('heading', { name: 'About Mina' })).toBeVisible();
  await expect(page.getByText('March 2, 2014')).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveCount(0);
  await expect(page.getByLabel('Date of birth')).toHaveCount(0);

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('You must agree to the liability waiver')).toBeVisible();
  expect((await registrationFor('Mina'))?.consent_given_at).toBeNull();

  await page.getByText('I have read and agree to the liability waiver.').click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Registration saved' })).toBeVisible();

  // Stamped with the signed-in parent, and still marked as an import.
  const minaRow = await registrationFor('Mina');
  expect(minaRow?.consent_given_at).not.toBeNull();
  expect(minaRow?.consent_by_user_id).toBe(await parentId());
  expect(minaRow?.source).toBe('import');

  // ---- Add a sibling: household details carry over, the child's do not --------
  await page.getByRole('button', { name: 'Register another kid' }).click();
  await expect(page.getByRole('heading', { name: 'About your kid' })).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveValue('');
  await expect(page.getByLabel('Home address')).toHaveValue('1 Church Way, Hayward, CA');

  await page.getByLabel('First name').fill('Marina');
  await page.getByLabel('Last name').fill('Guirguis');
  await page.getByLabel('Date of birth').fill('2012-05-20');
  await page.getByRole('group', { name: 'Gender' }).getByText('Female', { exact: true }).click();

  // Grade 7 is the one grade that chooses its own division.
  await page.getByLabel('Grade').selectOption('7');
  await page
    .getByRole('group', { name: 'Division' })
    .getByText('Ambassadors (7th–12th)')
    .click();
  await page.getByRole('group', { name: 'T-shirt size' }).getByText('M', { exact: true }).click();
  await page.screenshot({ path: 'test-results/register-2-form.png', fullPage: true });

  // Without the waiver nothing is written.
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByText('You must agree to the liability waiver')).toBeVisible();
  expect(await registrationFor('Marina')).toBeUndefined();

  await page.getByText('I have read and agree to the liability waiver.').click();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registered', exact: true })).toBeVisible();
  await expect(page.getByText('Marina Guirguis')).toBeVisible();
  await page.screenshot({ path: 'test-results/register-3-done.png', fullPage: true });

  const marina = await registrationFor('Marina');
  expect(marina).toMatchObject({
    parent_user_id: await parentId(),
    grade: 7,
    division: 'ambassadors',
    tshirt_size: 'M',
    source: 'parent',
    consent_by_user_id: await parentId(),
  });
  expect(marina?.consent_given_at).not.toBeNull();

  // ---- Back on the picker both kids are done ----------------------------------
  await page.goto('/register');
  await expect(page.getByRole('button', { name: /Mina Guirguis/ })).toContainText('Registered');
  await expect(page.getByRole('button', { name: /Marina Guirguis/ })).toContainText('Registered');
});

test('the waiver links to the program\'s document in a new tab', async ({ page }) => {
  await signIn(page, PARENT_EMAIL);
  await page.goto('/register');
  await page.getByRole('button', { name: 'Add another kid' }).click();

  const link = page.getByRole('link', { name: 'Read the liability waiver' });
  await expect(link).toHaveAttribute('href', /^https:\/\/drive\.google\.com\//);
  await expect(link).toHaveAttribute('target', '_blank');
});
