/**
 * RLS enforcement tests for the roles migration (supabase/migrations/*_roles.sql).
 *
 * Per AGENTS.md §7, role-based access control must be tested against the real
 * database, not mocked -- a wrong role must not see/edit data it shouldn't.
 * These tests connect to a real local Postgres (`supabase start`) and
 * impersonate users the same way PostgREST does: `SET LOCAL ROLE
 * authenticated` plus the `request.jwt.claims` GUC that `auth.uid()` reads
 * (confirmed against this project's actual `auth.uid()` definition, which
 * reads `request.jwt.claims->>'sub'`). See supabase/tests/helpers.ts.
 *
 * Run with `npm run test:db` -- requires `npx supabase start` first (see
 * .github/workflows/ci.yml's `db-tests` job for how CI does this).
 */
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { asUser, createProfile, grantRole, makePool, withTx } from './helpers';

let pool: Pool;

beforeAll(() => {
  pool = makePool();
});

afterAll(async () => {
  await pool.end();
});

describe('has_role()', () => {
  it('has_role reflects an explicit grant', async () => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: 'admin-grant@test.local' });
      await grantRole(client, userId, 'admin');

      const result = await asUser(client, userId, async () => {
        const r = await client.query<{ has_admin: boolean; has_coach: boolean }>(
          `select has_role('admin'::app_role) as has_admin, has_role('coach'::app_role) as has_coach`
        );
        return r.rows[0];
      });

      expect(result.has_admin).toBe(true);
      expect(result.has_coach).toBe(false);
    });
  });

  it('a user with no grants has no roles', async () => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: 'no-role@test.local' });

      const result = await asUser(client, userId, async () => {
        const r = await client.query<{ has_admin: boolean; has_any: boolean }>(
          `select has_role('admin'::app_role) as has_admin, has_any_role() as has_any`
        );
        return r.rows[0];
      });

      expect(result.has_admin).toBe(false);
      expect(result.has_any).toBe(false);
    });
  });
});

// ENG-16: roles come only from user_roles. Signup creates a profile and nothing
// else, and the legacy flag columns and helpers are gone.
describe('signup and the legacy role flags', () => {
  it('a new account gets a profile and no roles', async () => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: 'fresh-signup@test.local' });

      const profile = await client.query('select id, email from profiles where id = $1', [userId]);
      const roles = await client.query('select role from user_roles where user_id = $1', [userId]);

      expect(profile.rows).toHaveLength(1);
      expect(profile.rows[0].email).toBe('fresh-signup@test.local');
      expect(roles.rows).toHaveLength(0);
    });
  });

  it('ignores a signup_role in the account metadata', async () => {
    await withTx(pool, async (client) => {
      const id = randomUUID();
      await client.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, 'meta-role@test.local', '{"signup_role":"staff","display_name":"Meta"}'::jsonb)`,
        [id]
      );

      const roles = await client.query('select role from user_roles where user_id = $1', [id]);
      const profile = await client.query('select display_name from profiles where id = $1', [id]);

      expect(roles.rows).toHaveLength(0);
      expect(profile.rows[0].display_name).toBe('Meta');
    });
  });

  it('has dropped the profiles.is_staff / is_coach columns', async () => {
    const r = await pool.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name in ('is_staff', 'is_coach')`
    );
    expect(r.rows).toHaveLength(0);
  });

  it('has dropped the is_staff() and is_coach() helpers', async () => {
    const r = await pool.query(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and proname in ('is_staff', 'is_coach')`
    );
    expect(r.rows).toHaveLength(0);
  });

  it('lets a user edit their own profile but never grants them a role', async () => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: 'self-edit@test.local' });

      await asUser(client, userId, async () => {
        await client.query(`update profiles set display_name = 'Me' where id = $1`, [userId]);
      });

      const roles = await client.query('select role from user_roles where user_id = $1', [userId]);
      expect(roles.rows).toHaveLength(0);
    });
  });
});

describe('RLS on user_roles', () => {
  it('a user can read their own roles but not see others', async () => {
    await withTx(pool, async (client) => {
      const meId = await createProfile(client, { email: 'reads-own@test.local' });
      await grantRole(client, meId, 'coach');
      const otherId = await createProfile(client, { email: 'other@test.local' });
      await grantRole(client, otherId, 'coach');

      const rows = await asUser(client, meId, async () => {
        const r = await client.query('select user_id from user_roles');
        return r.rows;
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(meId);
    });
  });

  it('a non-admin cannot grant themselves a role', async () => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: 'self-grant-attempt@test.local' });

      const attempt = asUser(client, userId, async () => {
        await client.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [
          userId,
        ]);
      });

      await expect(attempt).rejects.toThrow(/row-level security/i);
    });
  });

  // The parent join link grants Parent with the service role (ENG-31). That is
  // the only path: a signed-in user's own session cannot give itself Parent, or
  // anyone else, so the role cannot be self-granted from the browser.
  it.each(['parent', 'kid'])('a non-admin cannot grant themselves the %s role', async (role) => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: `self-grant-${role}@test.local` });

      const attempt = asUser(client, userId, async () => {
        await client.query(`insert into user_roles (user_id, role) values ($1, $2)`, [userId, role]);
      });

      await expect(attempt).rejects.toThrow(/row-level security/i);
    });
  });

  it('a non-admin cannot grant a role to someone else', async () => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: 'non-admin-granter@test.local' });
      const targetId = await createProfile(client, { email: 'grant-target@test.local' });

      const attempt = asUser(client, userId, async () => {
        await client.query(`insert into user_roles (user_id, role) values ($1, 'coach')`, [
          targetId,
        ]);
      });

      await expect(attempt).rejects.toThrow(/row-level security/i);
    });
  });

  it('an admin can read and grant roles for anyone', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'admin-manager@test.local' });
      await grantRole(client, adminId, 'admin');
      const targetId = await createProfile(client, { email: 'grant-recipient@test.local' });

      const rows = await asUser(client, adminId, async () => {
        await client.query(`insert into user_roles (user_id, role) values ($1, 'prayer')`, [
          targetId,
        ]);
        const r = await client.query('select user_id, role from user_roles order by user_id');
        return r.rows;
      });

      expect(rows).toEqual(
        expect.arrayContaining([
          { user_id: adminId, role: 'admin' },
          { user_id: targetId, role: 'prayer' },
        ])
      );
    });
  });

  it('an anonymous (unauthenticated) request sees no roles at all', async () => {
    await withTx(pool, async (client) => {
      const someoneId = await createProfile(client, { email: 'anon-visibility@test.local' });
      await grantRole(client, someoneId, 'admin');

      await client.query('SET LOCAL ROLE anon');
      const r = await client.query('select * from user_roles');
      expect(r.rows).toHaveLength(0);
    });
  });
});

// ENG-16 PR 2: guards the Admin role-assignment screen relies on.
describe('user_roles guards', () => {
  it('an admin cannot remove their own admin role', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'self-lockout@test.local' });
      await grantRole(client, adminId, 'admin');

      const attempt = asUser(client, adminId, async () => {
        await client.query(`delete from user_roles where user_id = $1 and role = 'admin'`, [
          adminId,
        ]);
      });

      await expect(attempt).rejects.toThrow(/cannot remove your own admin role/i);
      const left = await client.query(
        `select 1 from user_roles where user_id = $1 and role = 'admin'`,
        [adminId]
      );
      expect(left.rowCount).toBe(1);
    });
  });

  it('an admin can remove their own non-admin roles', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'self-coach-removal@test.local' });
      await grantRole(client, adminId, 'admin');
      await grantRole(client, adminId, 'coach');

      await asUser(client, adminId, async () => {
        await client.query(`delete from user_roles where user_id = $1 and role = 'coach'`, [
          adminId,
        ]);
      });

      const left = await client.query(`select role from user_roles where user_id = $1`, [adminId]);
      expect(left.rows).toEqual([{ role: 'admin' }]);
    });
  });

  it('an admin can remove another admin', async () => {
    await withTx(pool, async (client) => {
      const a = await createProfile(client, { email: 'remover@test.local' });
      await grantRole(client, a, 'admin');
      const b = await createProfile(client, { email: 'removed@test.local' });
      await grantRole(client, b, 'admin');

      await asUser(client, a, async () => {
        await client.query(`delete from user_roles where user_id = $1 and role = 'admin'`, [b]);
      });

      const left = await client.query(`select 1 from user_roles where user_id = $1`, [b]);
      expect(left.rowCount).toBe(0);
    });
  });

  it('deleting a profile still cascades its roles (system deletes are not blocked)', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'cascade@test.local' });
      await grantRole(client, id, 'admin');

      await client.query('delete from auth.users where id = $1', [id]);

      const left = await client.query(`select 1 from user_roles where user_id = $1`, [id]);
      expect(left.rowCount).toBe(0);
    });
  });

  it('stamps granted_by with the caller, ignoring a forged value', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'granter@test.local' });
      await grantRole(client, adminId, 'admin');
      const forgedId = await createProfile(client, { email: 'forged@test.local' });
      const targetId = await createProfile(client, { email: 'grant-target-2@test.local' });

      await asUser(client, adminId, async () => {
        await client.query(
          `insert into user_roles (user_id, role, granted_by) values ($1, 'prayer', $2)`,
          [targetId, forgedId]
        );
      });

      const r = await client.query<{ granted_by: string }>(
        `select granted_by from user_roles where user_id = $1`,
        [targetId]
      );
      expect(r.rows[0].granted_by).toBe(adminId);
    });
  });

  it('an admin can revoke another user\'s role, a non-admin cannot', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'revoker@test.local' });
      await grantRole(client, adminId, 'admin');
      const coachId = await createProfile(client, { email: 'revoked-coach@test.local' });
      await grantRole(client, coachId, 'coach');
      const otherId = await createProfile(client, { email: 'not-admin@test.local' });
      await grantRole(client, otherId, 'coach');

      // A non-admin can't even see the row, so the delete matches nothing.
      const blocked = await asUser(client, otherId, async () => {
        const r = await client.query(`delete from user_roles where user_id = $1`, [coachId]);
        return r.rowCount;
      });
      expect(blocked).toBe(0);

      const revoked = await asUser(client, adminId, async () => {
        const r = await client.query(`delete from user_roles where user_id = $1`, [coachId]);
        return r.rowCount;
      });
      expect(revoked).toBe(1);
    });
  });
});
