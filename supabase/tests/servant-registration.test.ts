/**
 * RLS + behaviour tests for servant registration
 * (supabase/migrations/20261021120000_servant_registrations.sql):
 * `servant_registrations`, `submit_servant_registration()` and the
 * "authenticated reads current season" policy.
 *
 * The table holds DOB, home address and emergency contacts, so what matters is
 * who can read it (own row, or Admin) and that nobody can write it except
 * through the function, which takes user, season and email from the database.
 *
 * Run with `npm run test:db` (requires `npx supabase start`).
 */
import type { Pool, PoolClient } from 'pg';
import { asUser, createProfile, grantRole, makePool, withTx } from './helpers';

let pool: Pool;

beforeAll(() => {
  pool = makePool();
});

afterAll(async () => {
  await pool.end();
});

const payload = (over: Record<string, unknown> = {}) => ({
  full_name: 'Mina Hanna',
  evaluation_status: 'completed',
  is_serving: true,
  sessions: ['juniors'],
  juniors_subteams: ['coaches'],
  ambassadors_subteams: [],
  juniors_other: null,
  ambassadors_other: null,
  notes: null,
  dates_missing: null,
  phone: '(510) 555-1234',
  emergency_contact_name: 'Sara Hanna',
  emergency_contact_phone: '(510) 555-9876',
  gender: 'male',
  dob: '1990-04-02',
  home_address: '1 Main St, Hayward CA',
  ...over,
});

async function submitAs(
  client: PoolClient,
  userId: string,
  p: Record<string, unknown> = payload()
): Promise<boolean> {
  return asUser(client, userId, async () => {
    const r = await client.query<{ submit_servant_registration: boolean }>(
      'select public.submit_servant_registration($1::jsonb)',
      [JSON.stringify(p)]
    );
    return r.rows[0].submit_servant_registration;
  });
}

async function readAs(client: PoolClient, userId: string): Promise<{ user_id: string }[]> {
  return asUser(
    client,
    userId,
    async () => (await client.query('select user_id from servant_registrations')).rows
  );
}

describe('submit_servant_registration', () => {
  it('lets a roleless servant submit, then edit, their own registration', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'servant-a@test.local' });

      expect(await submitAs(client, id)).toBe(true);
      expect(await submitAs(client, id, payload({ dates_missing: 'Nov 3', notes: 'Prefer mornings' }))).toBe(false);

      const rows = (await client.query('select * from servant_registrations where user_id = $1', [id])).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].dates_missing).toBe('Nov 3');
      expect(rows[0].notes).toBe('Prefer mornings');
    });
  });

  it('takes the user, season and email from the database', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'servant-b@test.local' });
      const other = await createProfile(client, { email: 'servant-c@test.local' });

      await submitAs(client, id, payload({ user_id: other, season_id: null, email: 'spoof@test.local' }));

      const row = (await client.query('select * from servant_registrations')).rows[0];
      const season = (await client.query('select id from seasons where is_current')).rows[0].id;
      expect(row.user_id).toBe(id);
      expect(row.season_id).toBe(season);
      expect(row.email).toBe('servant-b@test.local');
    });
  });

  it('discards session answers when the servant is not serving', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'servant-d@test.local' });
      await submitAs(client, id);
      await submitAs(client, id, payload({ is_serving: false }));

      const row = (await client.query('select * from servant_registrations')).rows[0];
      expect(row.is_serving).toBe(false);
      expect(row.sessions).toEqual([]);
      expect(row.juniors_subteams).toEqual([]);
    });
  });

  it('rejects a serving registration with a session but no team or Other', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'servant-e@test.local' });
      await expect(
        submitAs(client, id, payload({ sessions: ['juniors', 'ambassadors'], ambassadors_subteams: [] }))
      ).rejects.toThrow(/servant_registrations_serving_shape/);
    });
  });

  it('rejects values outside the allowed lists', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'servant-f@test.local' });
      await expect(submitAs(client, id, payload({ juniors_subteams: ['goalkeepers'] }))).rejects.toThrow(
        /juniors_subteams_values/
      );
      await expect(submitAs(client, id, payload({ gender: 'other' }))).rejects.toThrow(/gender_values/);
      await expect(submitAs(client, id, payload({ evaluation_status: 'maybe' }))).rejects.toThrow(
        /evaluation_values/
      );
    });
  });

  it('fails when no season is current', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'servant-g@test.local' });
      await client.query('update seasons set is_current = false');
      await expect(submitAs(client, id)).rejects.toMatchObject({ code: '55000' });
    });
  });

  it('rejects an anonymous caller', async () => {
    await withTx(pool, async (client) => {
      await client.query('SET LOCAL ROLE anon');
      await expect(
        client.query('select public.submit_servant_registration($1::jsonb)', [JSON.stringify(payload())])
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('servant_registrations read access', () => {
  it('lets a servant read only their own row', async () => {
    await withTx(pool, async (client) => {
      const a = await createProfile(client, { email: 'read-a@test.local' });
      const b = await createProfile(client, { email: 'read-b@test.local' });
      await submitAs(client, a);
      await submitAs(client, b, payload({ full_name: 'Someone Else' }));

      expect(await readAs(client, a)).toEqual([{ user_id: a }]);
      expect(await readAs(client, b)).toEqual([{ user_id: b }]);
    });
  });

  it('lets an Admin read every row', async () => {
    await withTx(pool, async (client) => {
      const a = await createProfile(client, { email: 'read-c@test.local' });
      const b = await createProfile(client, { email: 'read-d@test.local' });
      const admin = await createProfile(client, { email: 'read-admin@test.local' });
      await grantRole(client, admin, 'admin');
      await submitAs(client, a);
      await submitAs(client, b);

      const ids = (await readAs(client, admin)).map((r) => r.user_id).sort();
      expect(ids).toEqual([a, b].sort());
    });
  });

  it.each(['coach', 'program', 'prayer', 'parent'])(
    'shows a %s nobody else\'s registration',
    async (role) => {
      await withTx(pool, async (client) => {
        const servant = await createProfile(client, { email: `own-${role}@test.local` });
        const viewer = await createProfile(client, { email: `viewer-${role}@test.local` });
        await grantRole(client, viewer, role);
        await submitAs(client, servant);

        expect(await readAs(client, viewer)).toHaveLength(0);
      });
    }
  );

  it('rejects an anonymous read', async () => {
    await withTx(pool, async (client) => {
      await client.query('SET LOCAL ROLE anon');
      await expect(client.query('select 1 from servant_registrations')).rejects.toThrow(/permission denied/);
    });
  });
});

describe('servant_registrations has no direct write path', () => {
  it('rejects INSERT, UPDATE and DELETE from a signed-in user, even an Admin', async () => {
    await withTx(pool, async (client) => {
      const admin = await createProfile(client, { email: 'write-admin@test.local' });
      await grantRole(client, admin, 'admin');
      await submitAs(client, admin);
      const season = (await client.query('select id from seasons where is_current')).rows[0].id;

      await expect(
        asUser(client, admin, () =>
          client.query(
            `insert into servant_registrations
               (user_id, season_id, full_name, evaluation_status, is_serving, email, phone,
                emergency_contact_name, emergency_contact_phone, gender, dob, home_address)
             values ($1, $2, 'x', 'completed', false, 'x@test.local', '1', 'x', '1', 'male', '1990-01-01', 'x')`,
            [admin, season]
          )
        )
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(client, admin, () => client.query(`update servant_registrations set full_name = 'x'`))
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(client, admin, () => client.query('delete from servant_registrations'))
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('seasons -- any signed-in user reads the current season', () => {
  it('shows a roleless servant the current season', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'season-servant@test.local' });
      const rows = await asUser(client, id, async () =>
        (await client.query('select is_current from seasons')).rows
      );
      expect(rows).toEqual([{ is_current: true }]);
    });
  });
});
