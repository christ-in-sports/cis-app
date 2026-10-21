/** Attendance setup, multiple coaches, live results and locks against local Supabase. */
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'crypto';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60_000);

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
      await client.query('delete from seasons where id = $1', [seasonId]);
    }
    if (emptySeasonId) await client.query('delete from seasons where id=$1', [emptySeasonId]);
    if (kidId) await client.query('delete from kids where id = $1', [kidId]);
    if (previousSeason) await client.query('update seasons set is_current = true where id = $1', [previousSeason]);
    for (const id of ids) await client.query('delete from auth.users where id = $1', [id]);
  });
});

test('Program sets up a team; both coaches mark it; Program sees results and locks it', async ({ page, browser }) => {
  await signIn(page, 'program');
  await page.goto('/attendance/teams');
  await page.getByLabel('New team name').fill(`Lions ${suffix}`);
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Lions ${suffix}` })).toBeVisible();
  await page.getByText('Assign coaches', { exact: true }).click();
  await page.getByText(`Attendance coach ${suffix}`, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: `Attendance coach ${suffix}` })).toBeChecked();
  await page.getByText(`Attendance second ${suffix}`, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: `Attendance second ${suffix}` })).toBeChecked();
  await page.locator('label').filter({ hasText: `Attendance ${suffix}` }).click();
  await page.getByLabel('Assign 1 selected kids to').selectOption({ label: `Lions ${suffix}` });
  await page.getByRole('button', { name: 'Save assignments' }).click();
  await expect(page.getByText('Team assignments saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Attendance', exact: true }).click();
  await page.getByRole('button', { name: 'Create attendance day' }).click();
  await expect(page.getByLabel('Season', { exact: true })).toHaveCount(0);
  await page.getByLabel('Date', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Create day', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Attendance open' })).toBeVisible();
  const sessionUrl = page.url();
  await expect(page.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toBeDisabled();
  const firstContext = await browser.newContext(); const first = await firstContext.newPage();
  const secondContext = await browser.newContext(); const second = await secondContext.newPage();
  try {
    await signIn(first, 'coach'); await first.goto(sessionUrl);
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
    await page.getByRole('link', { name: 'Attendance', exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Archive current attendance' }).click();
    await expect(page).toHaveURL('/attendance/archive');
    await expect(page.getByRole('link', { name: 'Archive', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: /Sun, Nov 1, 2026/ }).click();
    await expect(page.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toHaveValue('late');
    await expect(page.getByRole('combobox', { name: `Attendance for Attendance ${suffix}` })).toBeDisabled();
    await page.getByRole('button', { name: 'Restore day' }).click();
    await expect(page.getByRole('heading', { name: 'Attendance open' })).toBeVisible();
    await page.getByRole('link', { name: 'Teams', exact: true }).click();
    await expect(page.getByText(`Attendance ${suffix}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('attendance-teams-bottom-nav.png'), fullPage: true });
  } finally { await firstContext.close(); await secondContext.close(); }
});
