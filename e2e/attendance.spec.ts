/** Attendance setup, multiple coaches, live results and locks against local Supabase. */
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const dbUrl = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const authUrl = process.env.SUPABASE_AUTH_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const suffix = randomUUID().slice(0, 8);
const password = 'localdevpassword123';
const people = ['program', 'coach', 'second'] as const;
const ids: string[] = [];
let seasonId: string;
let kidId: string;
let emptySeasonId: string;
let previousSeason: string | undefined;
const extraKidIds: string[] = [];
let photoName: string | undefined;

async function db<T>(work: (client: Client) => Promise<T>) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(dbUrl).hostname) || !['127.0.0.1', 'localhost'].includes(new URL(authUrl).hostname)) throw new Error('Attendance E2E must run locally.');
  const client = new Client({ connectionString: dbUrl }); await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
const email = (person: string) => `attendance-${person}-${suffix}@local.test`;
async function signIn(page: Page, person: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email(person));
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/');
}

test.beforeAll(async () => {
  for (const person of people) {
    const response = await fetch(`${authUrl}/auth/v1/admin/users`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email(person), password, email_confirm: true, user_metadata: { display_name: `Attendance ${person} ${suffix}` } }),
    });
    if (!response.ok) throw new Error('Could not create local attendance test user.');
    ids.push((await response.json()).id);
  }
  await db(async (client) => {
    for (let i = 0; i < people.length; i++) await client.query('insert into user_roles(user_id, role) values ($1, $2)', [ids[i], i === 0 ? 'program' : 'coach']);
    previousSeason = (await client.query('select id from seasons where is_current')).rows[0]?.id;
    await client.query('update seasons set is_current = false where is_current');
    seasonId = (await client.query('insert into seasons(name, is_current) values ($1, true) returning id', [`Attendance ${suffix}`])).rows[0].id;
    kidId = (await client.query(`insert into kids(first_name, last_name, dob, gender, home_address, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone, guardian_email)
      values ('Attendance', $1, '2014-03-03', 'male', 'Local', 'EC', '555', 'Guardian', '555', 'guardian@local.test') returning id`, [suffix])).rows[0].id;
    await client.query("insert into registrations(kid_id, season_id, grade, division, tshirt_size) values ($1, $2, 6, 'juniors', 'M')", [kidId, seasonId]);
    await client.query('update seasons set is_current=false where id=$1', [seasonId]);
    emptySeasonId = (await client.query('insert into seasons(name,is_current) values ($1,true) returning id', [`Empty attendance ${suffix}`])).rows[0].id;
  });
});

test.afterAll(async () => {
  await db(async (client) => {
    if (seasonId) {
      await client.query('delete from attendance_groups where id in (select group_id from attendance_days where season_id = $1)', [seasonId]);
      await client.query('delete from attendance_team_snapshots where registration_id in (select id from registrations where season_id=$1)', [seasonId]);
      await client.query('delete from seasons where id = $1', [seasonId]);
    }
    if (emptySeasonId) await client.query('delete from seasons where id=$1', [emptySeasonId]);
    if (kidId) await client.query('delete from kids where id = $1', [kidId]);
    for (const id of extraKidIds) await client.query('delete from kids where id=$1', [id]);
    if (previousSeason) await client.query('update seasons set is_current = true where id = $1', [previousSeason]);
    await client.query('delete from attendance_groups where created_by=any($1::uuid[])', [ids]);
    for (const id of ids) await client.query('delete from auth.users where id = $1', [id]);
  });
  // Through the Storage API, which also removes the file (Postgres refuses to).
  if (photoName) {
    await fetch(`${authUrl}/storage/v1/object/kid-photos`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [photoName] }),
    });
  }
});

test('Program sets up a team; both coaches mark it; Program sees results and locks it', async ({ page, browser }) => {
  await signIn(page, 'program');
  await expect(page.getByRole('link', { name: /Teams/ })).toBeVisible();
  // An empty current season must not offer kids from an older registration roster.
  await page.goto('/teams');
  await expect(page.getByText(`Attendance ${suffix}`, { exact: true })).toHaveCount(0);
  await db(async (client) => {
    await client.query('update seasons set is_current=false where id=$1', [emptySeasonId]);
    await client.query('update seasons set is_current=true where id=$1', [seasonId]);
  });
  // Existing bookmarks preserve their filters and open the standalone page.
  await page.goto('/attendance/teams?division=juniors');
  await expect(page).toHaveURL('/teams?division=juniors');
  await page.getByLabel('New team name').fill(`Lions ${suffix}`);
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Lions ${suffix}` })).toBeVisible();
  await page.getByText('Edit team', { exact: true }).click();
  await page.getByLabel(`Team name for Lions ${suffix}`, { exact: true }).fill(`Tigers ${suffix}`);
  await page.getByRole('button', { name: 'Save team name' }).click();
  await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toBeVisible();
  await page.getByText('Assign coaches', { exact: true }).click();
  await page.getByText(`Attendance coach ${suffix}`, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: `Attendance coach ${suffix}` })).toBeChecked();
  await page.getByText(`Attendance second ${suffix}`, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: `Attendance second ${suffix}` })).toBeChecked();
  await page.locator('label').filter({ hasText: `Attendance ${suffix}` }).click();
  await page.getByLabel('Assign 1 selected kids to').selectOption({ label: `Tigers ${suffix}` });
  await page.getByRole('button', { name: 'Save assignments' }).click();
  await expect(page.getByText('Team assignments saved.')).toBeVisible();
  // Sports reads the same newly created team and coach links.
  await page.getByRole('link', { name: 'Sports', exact: true }).click();
  await page.getByRole('link', { name: 'Manage', exact: true }).click();
  await page.getByRole('link', { name: 'New block', exact: true }).click();
  await page.getByRole('button', { name: 'Create block', exact: true }).click();
  await expect(page.getByText('Needs at least 6 teams. This division has 1.')).toBeVisible();
  await page.getByRole('link', { name: 'Teams', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toBeVisible();
  await page.getByRole('link', { name: 'Attendance', exact: true }).click();
  await page.getByRole('button', { name: 'Create attendance day' }).click();
  await expect(page.getByLabel('Season', { exact: true })).toHaveCount(0);
  await page.getByLabel('Date', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Create day', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Attendance open' })).toBeVisible();
  const sessionUrl = page.url();
  // The kid has a photo, so a coach can match the face to the name. Uploaded as
  // the service role here, because this test is about who sees it, not uploading.
  photoName = `${randomUUID()}.jpg`;
  const upload = await fetch(`${authUrl}/storage/v1/object/kid-photos/${photoName}`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'image/jpeg' },
    body: readFileSync('e2e/fixtures/kid.jpg'),
  });
  expect(upload.ok).toBe(true);
  await db((client) => client.query('update kids set photo_path = $1, photo_updated_at = now() where id = $2', [photoName, kidId]));
  await expect(page.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toBeDisabled();
  const firstContext = await browser.newContext(); const first = await firstContext.newPage();
  const secondContext = await browser.newContext(); const second = await secondContext.newPage();
  try {
    await signIn(first, 'coach');
    await expect(first.getByRole('link', { name: 'Teams' })).toHaveCount(0);
    await first.goto('/teams');
    await expect(first).toHaveURL('/');
    await first.goto(sessionUrl);
    // The coach of the kid's team is handed a signed link to the photo, and it loads.
    const face = first.locator('img[src*="/storage/v1/object/sign/kid-photos/"]');
    await expect(face).toHaveCount(1);
    await expect.poll(() => face.evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await first.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` }).selectOption('present');
    await expect(first.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByText('1 / 1 present · 0 unmarked', { exact: true })).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: test.info().outputPath('attendance.png'), fullPage: true });
    await signIn(second, 'second'); await second.goto(sessionUrl);
    await second.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` }).selectOption('late');
    await expect(second.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lock attendance', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Attendance locked' })).toBeVisible();
    await first.reload();
    await expect(first.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toBeDisabled();
    await page.getByRole('link', { name: 'Summary', exact: true }).click();
    const row = page.getByRole('row', { name: new RegExp(`Attendance ${suffix}`) });
    await expect(row).toContainText('100');
    await expect(page.getByText('Start a new season')).toHaveCount(0);
    // Registrations added after this day still appear in the award roster with zero attendance.
    await db(async (client) => {
      for (const [name, division, grade] of [['Zero', 'juniors', 6], ['Ambassador', 'ambassadors', 9]] as const) {
        const kid = await client.query(`insert into kids(first_name,last_name,dob,gender,home_address,emergency_contact_name,emergency_contact_phone,guardian_name,guardian_phone,guardian_email)
          values ($1,$2,'2014-03-03','male','Local','EC','555','Guardian','555','guardian@local.test') returning id`, [name, suffix]);
        extraKidIds.push(kid.rows[0].id);
        await client.query("insert into registrations(kid_id,season_id,grade,division,tshirt_size) values ($1,$2,$3,$4,'M')", [kid.rows[0].id, seasonId, grade, division]);
      }
    });
    await page.getByRole('link', { name: 'Attendance awards', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Attendance awards' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Summary', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('row', { name: new RegExp(`Zero ${suffix}`) })).toContainText('0');
    await expect(page.getByRole('row', { name: new RegExp(`Ambassador ${suffix}`) })).toHaveCount(0);
    await page.getByLabel('Sort by', { exact: true }).selectOption('team');
    await expect(page).toHaveURL(/sort=team/);
    await page.getByLabel('Team', { exact: true }).selectOption({ label: `Tigers ${suffix}` });
    await expect(page.getByRole('row', { name: new RegExp(`Zero ${suffix}`) })).toHaveCount(0);
    await expect(page.getByRole('row', { name: new RegExp(`Attendance ${suffix}`) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`Attendance ${suffix}`) }).getByRole('cell').first()).toHaveText('1');
    await page.getByLabel('Division', { exact: true }).selectOption('ambassadors');
    await expect(page.getByLabel('Team', { exact: true })).toHaveValue('all');
    await expect(page.getByRole('row', { name: new RegExp(`Ambassador ${suffix}`) })).toBeVisible();
    await page.getByLabel('Division', { exact: true }).selectOption('juniors');
    await expect(page.getByRole('row', { name: new RegExp(`Zero ${suffix}`) })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('attendance-awards.png'), fullPage: true });
    await second.goto('/attendance/awards');
    await expect(second).toHaveURL('/');
    await first.reload();
    await expect(first.getByRole('button', { name: 'Delete attendance day' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Attendance', exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Archive current attendance' }).click();
    await expect(page).toHaveURL('/attendance/archive');
    await expect(page.getByRole('link', { name: 'Archive', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'View archived teams' }).click();
    await expect(page.getByRole('heading', { name: 'Archived teams' })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toBeVisible();
    await page.getByText('View roster', { exact: true }).click();
    await expect(page.getByText(`Attendance ${suffix} · Grade 6`, { exact: true })).toBeVisible();
    await expect(page.getByText('Edit team', { exact: true })).toHaveCount(0);
    // Retired teams remain for history but no longer inflate Sports setup counts.
    await page.goto('/sports/manage?division=juniors');
    await expect(page.getByText('Needs at least 6 teams. This division has 0.')).toBeVisible();
    await page.goto('/teams?view=archive');
    await page.getByLabel('Teams', { exact: true }).selectOption('current');
    await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toHaveCount(0);
    await page.getByLabel('New team name').fill(`Tigers ${suffix}`);
    await page.getByRole('button', { name: 'Create team', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toBeVisible();
    await page.locator('label').filter({ hasText: `Attendance ${suffix}` }).click();
    await page.getByLabel('Assign 1 selected kids to').selectOption({ label: `Tigers ${suffix}` });
    await page.getByRole('button', { name: 'Save assignments' }).click();
    await expect(page.getByText('Team assignments saved.')).toBeVisible();
    await first.goto(sessionUrl);
    await expect(first.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toHaveValue('late');
    await expect(first.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toBeDisabled();
    await page.goto(sessionUrl);
    await expect(page.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toHaveValue('late');
    await expect(page.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toBeDisabled();
    await page.getByRole('button', { name: 'Restore day' }).click();
    await expect(page.getByRole('heading', { name: 'Attendance open' })).toBeVisible();
    await page.getByRole('link', { name: 'Teams', exact: true }).click();
    await expect(page.getByText(`Attendance ${suffix}`, { exact: true })).toBeVisible();
    await page.getByText('Edit team', { exact: true }).click();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Delete team', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete team', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toHaveCount(0);
    await expect(page.getByText(`Attendance ${suffix}`, { exact: true })).toBeVisible();
    await page.getByLabel('Teams', { exact: true }).selectOption('archive');
    await expect(page.getByRole('heading', { name: `Tigers ${suffix}` })).toBeVisible();
    await page.getByText('View roster', { exact: true }).click();
    await expect(page.getByText(`Attendance ${suffix} · Grade 6`, { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('attendance-teams-bottom-nav.png'), fullPage: true });
    await page.goto(sessionUrl);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('permanently deleted');
      return dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Delete attendance day' }).click();
    await expect(page.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toHaveValue('late');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete attendance day' }).click();
    await expect(page).toHaveURL('/attendance');
    await expect(page.getByRole('link', { name: /Sun, Nov 1, 2026/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Teams', exact: true }).click();
    await expect(page.getByText(`Attendance ${suffix}`, { exact: true })).toBeVisible();
  } finally { await firstContext.close(); await secondContext.close(); }
});
