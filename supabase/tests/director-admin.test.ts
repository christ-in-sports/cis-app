import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { asUser, createProfile, grantRole, makePool, withTx } from './helpers';

let pool: Pool;
beforeAll(() => { pool = makePool(); });
afterAll(async () => { await pool.end(); });

async function actor(client: PoolClient, role: string) {
  const id = await createProfile(client, { email: `${randomUUID()}@roles.test` });
  await grantRole(client, id, role);
  return id;
}

const commitment = {
  full_name: 'Test Servant', evaluation_status: 'completed', is_serving: false,
  sessions: [], juniors_subteams: [], ambassadors_subteams: [], phone: '555-0100',
  emergency_contact_name: 'Contact', emergency_contact_phone: '555-0101',
  gender: 'male', dob: '1990-04-02', home_address: '1 Main St',
};

it('Admin can submit/read their own commitment; only Director can read all commitments', async () => {
  await withTx(pool, async (client) => {
    const director = await actor(client, 'director');
    const admin = await actor(client, 'admin');
    const coach = await actor(client, 'coach');
    for (const id of [director, admin, coach]) {
      await asUser(client, id, () => client.query('select submit_servant_registration($1::jsonb)', [JSON.stringify(commitment)]));
    }
    const read = (id: string) => asUser(client, id, async () => (await client.query('select user_id from servant_registrations')).rows.map(r => r.user_id));
    expect(await read(admin)).toEqual([admin]);
    expect(await read(director)).toEqual(expect.arrayContaining([director, admin, coach]));
    // Combining operational roles still does not grant leadership privileges.
    await grantRole(client, admin, 'program');
    await grantRole(client, admin, 'prayer');
    expect(await read(admin)).toEqual([admin]);
  });
});

it.each(['director', 'admin', 'coach', 'parent'])('%s has the intended role-list access', async (role) => {
  await withTx(pool, async (client) => {
    const me = await actor(client, role);
    const other = await actor(client, 'coach');
    const visible = await asUser(client, me, async () => (await client.query('select user_id from user_roles')).rows.map(r => r.user_id));
    expect(visible).toContain(me);
    if (role === 'director') expect(visible).toContain(other);
    else expect(visible).not.toContain(other);
  });
});

it('Admin cannot promote themselves, grant another role, revoke a Director, or change grants', async () => {
  await withTx(pool, async (client) => {
    const admin = await actor(client, 'admin');
    const director = await actor(client, 'director');
    for (const [id, role] of [[admin, 'director'], [director, 'coach']]) {
      await expect(asUser(client, admin, () => client.query('insert into user_roles (user_id, role) values ($1,$2)', [id, role])))
        .rejects.toMatchObject({ code: '42501' });
    }
    expect((await asUser(client, admin, () => client.query("delete from user_roles where role = 'director'"))).rowCount).toBe(0);
    await asUser(client, admin, () => client.query("update user_roles set role = 'director' where user_id = $1", [admin]));
    expect((await client.query('select role from user_roles where user_id = $1', [admin])).rows).toEqual([{ role: 'admin' }]);
  });
});

it.each(['director', 'admin'])('%s keeps roster, payment, consent, team and attendance operations', async (role) => {
  await withTx(pool, async (client) => {
    const me = await actor(client, role);
    const coach = await actor(client, 'coach');
    const season = (await client.query('select id from seasons where is_current limit 1')).rows[0].id;
    const kid = await asUser(client, me, () => client.query(`insert into kids
      (first_name,last_name,dob,gender,home_address,emergency_contact_name,emergency_contact_phone,guardian_name,guardian_phone,guardian_email)
      values ('Role','Kid','2014-03-02','male','1 Main St','EC','555','Guardian','555','g@test.local') returning id`));
    const registration = await asUser(client, me, () => client.query(`insert into registrations
      (kid_id,season_id,grade,division,tshirt_size) values ($1,$2,6,'juniors','M') returning id`, [kid.rows[0].id, season]));
    const reg = registration.rows[0].id;
    const team = await asUser(client, me, () => client.query("insert into ministry_teams(name,division,season_id) values ($1,'juniors',$2) returning id", [randomUUID(), season]));
    await asUser(client, me, () => client.query('insert into team_coaches(team_id,user_id) values ($1,$2)', [team.rows[0].id, coach]));
    await asUser(client, me, () => client.query('select assign_attendance_team($1::uuid[],$2)', [[reg], team.rows[0].id]));
    await asUser(client, me, () => client.query('select set_registrations_consent($1::uuid[],true)', [[reg]]));
    const payment = await asUser(client, me, () => client.query("select * from record_payments($1::uuid[],2500,'cash')", [[reg]]));
    expect(payment.rows).toHaveLength(1);
    const day = await asUser(client, me, () => client.query("select create_attendance_date('2090-01-01') id"));
    const saved = await asUser(client, me, () => client.query("update attendance_records set status='present',note='Saved by leadership' where day_id=$1 and registration_id=$2 returning id", [day.rows[0].id, reg]));
    expect(saved.rows).toHaveLength(1);
    await asUser(client, me, () => client.query('select delete_payment($1)', [payment.rows[0].payment_id]));
  });
});

it.each(['director', 'admin'])('%s can find a parent without reading their role grants', async (role) => {
  await withTx(pool, async (client) => {
    const me = await actor(client, role);
    const parent = await actor(client, 'parent');
    const profile = (await client.query('select email from profiles where id=$1', [parent])).rows[0];
    const result = await asUser(client, me, () => client.query('select * from find_parent_account($1)', [` ${profile.email.toUpperCase()} `]));
    expect(result.rows).toEqual([expect.objectContaining({ id: parent, is_parent: true })]);
    const ownEmail = (await client.query('select email from profiles where id=$1', [me])).rows[0].email;
    const notParent = await asUser(client, me, () => client.query('select * from find_parent_account($1)', [ownEmail]));
    expect(notParent.rows[0].is_parent).toBe(false);
  });
});

it.each(['coach', 'program', 'prayer', 'parent', 'kid'])('%s cannot call the parent-account lookup', async (role) => {
  await withTx(pool, async (client) => {
    const me = await actor(client, role);
    await expect(asUser(client, me, () => client.query("select * from find_parent_account('someone@test.local')")))
      .rejects.toMatchObject({ code: '42501' });
  });
});

it('anonymous users cannot execute the parent lookup', async () => {
  const result = await pool.query("select has_function_privilege('anon','public.find_parent_account(text)','execute') allowed");
  expect(result.rows[0].allowed).toBe(false);
});
