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
import type { Pool } from 'pg';
import { asUser, createProfile, grantRole, makePool, withTx } from './helpers';

let pool: Pool;

beforeAll(() => {
  pool = makePool();
});

afterAll(async () => {
  await pool.end();
});

describe('has_role() / is_staff() / is_coach()', () => {
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
        const r = await client.query<{ has_admin: boolean; staff: boolean; coach: boolean }>(
          `select has_role('admin'::app_role) as has_admin, is_staff() as staff, is_coach() as coach`
        );
        return r.rows[0];
      });

      expect(result.has_admin).toBe(false);
      expect(result.staff).toBe(false);
      expect(result.coach).toBe(false);
    });
  });

  it('is_staff() is true only for the admin role, not the old is_staff boolean alone', async () => {
    // Regression guard for the migration's core behavior-preservation claim:
    // is_staff() now means has_role('admin'), not profiles.is_staff.
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, {
        email: 'legacy-staff-flag-only@test.local',
        isStaff: true, // the OLD boolean is true, but no role has been granted
      });

      const staff = await asUser(client, userId, async () => {
        const r = await client.query<{ staff: boolean }>(`select is_staff() as staff`);
        return r.rows[0].staff;
      });

      expect(staff).toBe(false);
    });
  });

  it('is_coach() is true for admin (via is_staff) or an explicit coach grant', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'admin-is-coach-too@test.local' });
      await grantRole(client, adminId, 'admin');
      const coachId = await createProfile(client, { email: 'coach-grant@test.local' });
      await grantRole(client, coachId, 'coach');

      const adminCoach = await asUser(client, adminId, async () => {
        const r = await client.query<{ coach: boolean }>(`select is_coach() as coach`);
        return r.rows[0].coach;
      });
      const coachCoach = await asUser(client, coachId, async () => {
        const r = await client.query<{ coach: boolean }>(`select is_coach() as coach`);
        return r.rows[0].coach;
      });

      expect(adminCoach).toBe(true);
      expect(coachCoach).toBe(true);
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
