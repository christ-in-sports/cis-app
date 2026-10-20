/**
 * Access to public.profiles after the lockdown
 * (supabase/migrations/20261020120000_profiles_access.sql, ENG-16).
 *
 * Profiles hold every account's email, and the anon key is public, so signed-out
 * visitors must read nothing, a signed-in user only themselves, and an Admin
 * everyone. A user may change their own display name but not their email (it is a
 * mirror of the login email, and the Admin roles screen shows it).
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

type Actor = 'admin' | 'coach' | 'program' | 'prayer' | 'parent' | 'none';
const NON_ADMINS: Actor[] = ['coach', 'program', 'prayer', 'parent', 'none'];

async function seed(client: PoolClient): Promise<Record<Actor, string>> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<Actor, string>;
  for (const actor of ['admin', 'coach', 'program', 'prayer', 'parent', 'none'] as Actor[]) {
    ids[actor] = await createProfile(client, { email: `profiles-${actor}-${suffix}@test.local` });
    if (actor !== 'none') await grantRole(client, ids[actor], actor);
  }
  return ids;
}

/** Runs `sql` as the anonymous role, rolled back so a failure cannot poison the transaction. */
async function asAnon<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query('SAVEPOINT as_anon');
  try {
    await client.query('SET LOCAL ROLE anon');
    const result = await fn();
    await client.query('RESET ROLE');
    await client.query('RELEASE SAVEPOINT as_anon');
    return result;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT as_anon');
    throw err;
  }
}

describe('reading profiles', () => {
  it('a signed-out visitor cannot read profiles at all', async () => {
    await withTx(pool, async (client) => {
      await seed(client);
      await expect(
        asAnon(client, () => client.query('select email from public.profiles'))
      ).rejects.toThrow(/permission denied for table profiles/i);
    });
  });

  it.each(NON_ADMINS)('%s reads only their own profile', async (actor) => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      const rows = await asUser(client, ids[actor], async () => {
        const r = await client.query<{ id: string }>('select id from public.profiles');
        return r.rows;
      });
      expect(rows).toEqual([{ id: ids[actor] }]);
    });
  });

  it('an admin reads every profile', async () => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      const found = await asUser(client, ids.admin, async () => {
        const r = await client.query<{ id: string }>('select id from public.profiles');
        return new Set(r.rows.map((x) => x.id));
      });
      for (const id of Object.values(ids)) expect(found.has(id)).toBe(true);
    });
  });

  it("a user cannot look up someone else's email by id", async () => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      const rows = await asUser(client, ids.parent, async () => {
        const r = await client.query('select email from public.profiles where id = $1', [ids.admin]);
        return r.rows;
      });
      expect(rows).toHaveLength(0);
    });
  });
});

describe('updating profiles', () => {
  it('a user can change their own display name', async () => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      await asUser(client, ids.parent, async () => {
        await client.query(`update public.profiles set display_name = 'New Name' where id = $1`, [
          ids.parent,
        ]);
      });
      const r = await client.query('select display_name from public.profiles where id = $1', [
        ids.parent,
      ]);
      expect(r.rows[0].display_name).toBe('New Name');
    });
  });

  it('a user cannot change their own email', async () => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      await expect(
        asUser(client, ids.parent, async () => {
          await client.query(`update public.profiles set email = 'director@example.com' where id = $1`, [
            ids.parent,
          ]);
        })
      ).rejects.toThrow(/permission denied for table profiles/i);
    });
  });

  it('a user cannot change their own id', async () => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      await expect(
        asUser(client, ids.parent, async () => {
          await client.query(`update public.profiles set id = $2 where id = $1`, [
            ids.parent,
            ids.admin,
          ]);
        })
      ).rejects.toThrow(/permission denied for table profiles/i);
    });
  });

  it("a user cannot change someone else's display name", async () => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      const changed = await asUser(client, ids.parent, async () => {
        const r = await client.query(`update public.profiles set display_name = 'Hijacked' where id = $1`, [
          ids.coach,
        ]);
        return r.rowCount;
      });
      expect(changed).toBe(0);
    });
  });

  it("even an admin cannot change someone else's display name through the API", async () => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      const changed = await asUser(client, ids.admin, async () => {
        const r = await client.query(`update public.profiles set display_name = 'Renamed' where id = $1`, [
          ids.coach,
        ]);
        return r.rowCount;
      });
      expect(changed).toBe(0);
    });
  });

  it('a signed-out visitor cannot update profiles', async () => {
    await withTx(pool, async (client) => {
      await seed(client);
      await expect(
        asAnon(client, () => client.query(`update public.profiles set display_name = 'x'`))
      ).rejects.toThrow(/permission denied for table profiles/i);
    });
  });
});

describe('creating and removing profiles', () => {
  it.each(['admin', 'parent'] as Actor[])('%s cannot insert a profile through the API', async (actor) => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      await expect(
        asUser(client, ids[actor], async () => {
          await client.query(
            `insert into public.profiles (id, email) values (gen_random_uuid(), 'fake@example.com')`
          );
        })
      ).rejects.toThrow(/permission denied for table profiles/i);
    });
  });

  it.each(['admin', 'parent'] as Actor[])('%s cannot delete a profile through the API', async (actor) => {
    await withTx(pool, async (client) => {
      const ids = await seed(client);
      await expect(
        asUser(client, ids[actor], async () => {
          await client.query('delete from public.profiles where id = $1', [ids.coach]);
        })
      ).rejects.toThrow(/permission denied for table profiles/i);
    });
  });

  it('the signup trigger still creates a profile (it runs as the table owner)', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'trigger-check@test.local' });
      const r = await client.query('select email from public.profiles where id = $1', [id]);
      expect(r.rows[0].email).toBe('trigger-check@test.local');
    });
  });

  it('deleting an account still removes its profile and roles (the auth cascade)', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'cascade-profile@test.local' });
      await grantRole(client, id, 'coach');

      await client.query('delete from auth.users where id = $1', [id]);

      expect((await client.query('select 1 from public.profiles where id = $1', [id])).rowCount).toBe(0);
      expect((await client.query('select 1 from user_roles where user_id = $1', [id])).rowCount).toBe(0);
    });
  });
});
