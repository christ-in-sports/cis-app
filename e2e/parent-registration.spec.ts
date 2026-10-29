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
 * Every kid needs a photo (ENG-21), so the run uploads real ones to the local
 * Storage: a JPEG for the imported kid, and an iPhone-style HEIC for the new one,
 * which Chromium cannot decode itself and so exercises the converter. They are
 * checked in Storage as WebP, owned by the parent, and a kid on a team can still
 * have a photo replaced.
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
 * Leaves the parent with exactly one kid they can see: Mina, as a CSV import
 * would have left her but with an Admin having attached her to this parent (the
 * app never links by email, ENG-29), and a registration with no consent.
 *
 * Also leaves Nour, an imported kid with this parent's email as guardian but no
 * linked parent, who must stay out of sight: an email is not proof of ownership.
 *
 * Scoped to this parent's own rows, so it never touches anyone else's data.
 */
async function resetParentData(): Promise<void> {
  await deleteParentUploads();
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
         guardian_name, guardian_phone, guardian_email, parent_user_id
       ) values ('Mina','Guirguis','2014-03-02','male','1 Church Way, Hayward, CA',
                 'Peter Guirguis','(510) 555-0122','Mariam Guirguis','(510) 555-0111',$1,
                 (select id from auth.users where email = $1))
       returning id`,
      [PARENT_EMAIL],
    );
    await client.query(
      `insert into kids (
         first_name, last_name, dob, gender, home_address,
         emergency_contact_name, emergency_contact_phone,
         guardian_name, guardian_phone, guardian_email
       ) values ('Nour','Guirguis','2012-05-09','female','1 Church Way, Hayward, CA',
                 'Peter Guirguis','(510) 555-0122','Mariam Guirguis','(510) 555-0111',$1)`,
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

interface StoredPhoto {
  photo_path: string | null;
  mimetype: string | null;
  owner_id: string | null;
}

/** The kid's photo as Storage holds it: its path, type and who uploaded it. */
async function storedPhotoFor(firstName: string): Promise<StoredPhoto | undefined> {
  return withDb(async (client) => {
    const r = await client.query<StoredPhoto>(
      `select k.photo_path, o.metadata ->> 'mimetype' as mimetype, o.owner_id
         from kids k
         left join storage.objects o on o.bucket_id = 'kid-photos' and o.name = k.photo_path
        where k.guardian_email = $1 and k.first_name = $2`,
      [PARENT_EMAIL, firstName],
    );
    return r.rows[0];
  });
}

async function objectExists(name: string): Promise<boolean> {
  return withDb(async (client) => {
    const r = await client.query(
      `select 1 from storage.objects where bucket_id = 'kid-photos' and name = $1`,
      [name],
    );
    return r.rowCount === 1;
  });
}

/**
 * Removes what earlier runs uploaded for this parent, through the Storage API
 * (which also removes the files; Postgres refuses to delete objects itself).
 */
async function deleteParentUploads(): Promise<void> {
  const names = await withDb(async (client) => {
    const r = await client.query<{ name: string }>(
      `select o.name from storage.objects o
        where o.bucket_id = 'kid-photos'
          and o.owner_id in (select id::text from auth.users where email = $1)`,
      [PARENT_EMAIL],
    );
    return r.rows.map((row) => row.name);
  });
  if (names.length === 0) return;
  await fetch(`${AUTH_URL}/storage/v1/object/kid-photos`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: names }),
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
  // A coach, not roleless: a roleless user is sent to the servant form instead.
  await ensureUser(OUTSIDER_EMAIL, 'coach');
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

  // ---- The app bar: a parent gets no attendance and no Registration tabs -----
  const app = page.getByRole('navigation', { name: 'App' });
  await expect(app.getByRole('link')).toHaveText(['Today', 'Sports', 'More']);
  await expect(app.getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Registration' })).toHaveCount(0);

  // ---- A parent is not a servant: no servant registration, in More or by URL --
  await page.goto('/more');
  await expect(page.getByRole('link', { name: /Register a kid/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My registration' })).toHaveCount(0);
  await page.goto('/servant-registration');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/register');

  // ---- The attached kid is shown and not finished; one only matching by email is not ----
  await expect(page.getByRole('heading', { name: 'Who are you registering?' })).toBeVisible();
  const mina = page.getByRole('button', { name: /Mina Guirguis/ });
  await expect(page.getByRole('button', { name: /Nour Guirguis/ })).toHaveCount(0);
  await expect(mina).toContainText('Grade 6 · Waiver needed');
  await expect(mina).toContainText('Photo needed');
  await expect(mina).toContainText('Finish');
  await expect(mina.locator('img')).toHaveCount(0); // initials, not a photo
  await page.screenshot({ path: 'test-results/register-1-picker.png', fullPage: true });

  // ---- Complete her: identity is locked, the waiver is required ---------------
  await mina.click();
  await expect(page.getByRole('heading', { name: 'About Mina' })).toBeVisible();
  await expect(page.getByText('March 2, 2014')).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveCount(0);
  await expect(page.getByLabel('Date of birth')).toHaveCount(0);

  // She has no photo yet, and the form will not go without one.
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('You must agree to the liability waiver')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Add a photo of your kid' })).toBeVisible();
  expect((await registrationFor('Mina'))?.consent_given_at).toBeNull();

  await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/kid.jpg');
  await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Add a photo of your kid' })).toHaveCount(0);

  await page.getByText('I have read and agree to the liability waiver.').click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Registration saved' })).toBeVisible();

  // Stamped with the signed-in parent, and still marked as an import.
  const minaRow = await registrationFor('Mina');
  expect(minaRow?.consent_given_at).not.toBeNull();
  expect(minaRow?.consent_by_user_id).toBe(await parentId());
  expect(minaRow?.source).toBe('import');

  // The photo was uploaded by the parent, resized to WebP, and attached to her.
  const minaPhoto = await storedPhotoFor('Mina');
  expect(minaPhoto?.photo_path).toMatch(/^[0-9a-f-]{36}\.webp$/);
  expect(minaPhoto?.mimetype).toBe('image/webp');
  expect(minaPhoto?.owner_id).toBe(await parentId());

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

  // Without the waiver, or a photo, nothing is written.
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByText('You must agree to the liability waiver')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Add a photo of your kid' })).toBeVisible();
  expect(await registrationFor('Marina')).toBeUndefined();

  // An iPhone photo. Chromium cannot read HEIC, so this goes through the
  // converter, which is downloaded only now and takes a moment.
  await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/IMG_0001.HEIC');
  await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible({ timeout: 30_000 });

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

  // The HEIC was converted in the browser: WebP is what is stored, never HEIC.
  const marinaPhoto = await storedPhotoFor('Marina');
  expect(marinaPhoto?.photo_path).toMatch(/^[0-9a-f-]{36}\.webp$/);
  expect(marinaPhoto?.mimetype).toBe('image/webp');
  expect(marinaPhoto?.owner_id).toBe(await parentId());

  // ---- Back on the picker both kids are done, each with a face ----------------
  await page.goto('/register');
  await expect(page.getByRole('button', { name: /Mina Guirguis/ })).toContainText('Registered');
  await expect(page.getByRole('button', { name: /Marina Guirguis/ })).toContainText('Registered');
  await expect(page.getByText('Photo needed')).toHaveCount(0);
  for (const name of [/Mina Guirguis/, /Marina Guirguis/]) {
    const face = page.getByRole('button', { name }).locator('img');
    await expect(face).toHaveCount(1);
    // A real image from the private bucket, through a signed link, not a broken one.
    await expect
      .poll(() => face.evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))
      .toBe(true);
  }
  await page.screenshot({ path: 'test-results/register-4-picker-photos.png', fullPage: true });
});

test('a kid on a team can still have their photo replaced, and the old one is deleted', async ({ page }) => {
  await signIn(page, PARENT_EMAIL);
  await page.goto('/register');
  const before = (await storedPhotoFor('Marina'))?.photo_path;
  expect(before).toBeTruthy();

  // An Admin places her on a team: the registration is locked from here.
  await withDb(async (client) => {
    const team = await client.query<{ id: string }>(
      `insert into ministry_teams (name, division) values ('E2E photo team', 'ambassadors') returning id`,
    );
    await client.query(
      `update registrations set team_id = $1
        where kid_id in (select id from kids where guardian_email = $2 and first_name = 'Marina')`,
      [team.rows[0].id, PARENT_EMAIL],
    );
  });
  try {
    await page.goto('/register');
    await page.getByRole('button', { name: /Marina Guirguis/ }).click();
    await expect(page.getByText('Marina Guirguis is on a team')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/kid.jpg');

    // It attaches at once: there is no registration left to submit it with.
    await expect.poll(async () => (await storedPhotoFor('Marina'))?.photo_path).not.toBe(before);
    expect((await storedPhotoFor('Marina'))?.mimetype).toBe('image/webp');
    // The replaced file is gone, because its uploader may delete it once nothing uses it.
    await expect.poll(() => objectExists(before!)).toBe(false);
  } finally {
    await withDb(async (client) => {
      await client.query(
        `update registrations set team_id = null
          where kid_id in (select id from kids where guardian_email = $1)`,
        [PARENT_EMAIL],
      );
      await client.query(`delete from ministry_teams where name = 'E2E photo team'`);
    });
  }
});

test('the waiver links to the program\'s document in a new tab', async ({ page }) => {
  await signIn(page, PARENT_EMAIL);
  await page.goto('/register');
  await page.getByRole('button', { name: 'Add another kid' }).click();

  const link = page.getByRole('link', { name: 'Read the liability waiver' });
  await expect(link).toHaveAttribute('href', /^https:\/\/drive\.google\.com\//);
  await expect(link).toHaveAttribute('target', '_blank');
});
