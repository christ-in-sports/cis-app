import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'crypto';

/**
 * Connects directly to Postgres (bypassing PostgREST/supabase-js) as the
 * `postgres` superuser, then simulates PostgREST's own request-scoped
 * impersonation: `SET LOCAL ROLE <role>` plus the `request.jwt.claims` GUC
 * that `auth.uid()` reads (verified against this project's local
 * `auth.uid()` definition -- see supabase/tests/roles.test.ts's header
 * comment). This exercises the real RLS policies exactly as Postgres
 * evaluates them for an authenticated request, without needing a running
 * GoTrue/PostgREST stack or real JWTs.
 */

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function makePool(): Pool {
  return new Pool({ connectionString: DB_URL });
}

/** Runs `fn` inside a transaction that is always rolled back, so tests never leave residue. */
export async function withTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

/**
 * Runs `fn` as the given user, under Postgres's `authenticated` role, the
 * same role PostgREST uses for a signed-in request. Restores the superuser
 * role afterward so setup/assertions between impersonated calls run
 * unrestricted by RLS.
 *
 * Wrapped in a SAVEPOINT: an expected RLS rejection aborts only this block,
 * not the whole outer transaction from `withTx` -- without it, a caller
 * asserting `await expect(asUser(...)).rejects.toThrow(...)` would poison
 * the rest of the transaction (including the `RESET ROLE` cleanup itself)
 * once Postgres marks it aborted.
 */
export async function asUser<T>(
  client: PoolClient,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  await client.query('SAVEPOINT as_user');
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await client.query('SET LOCAL ROLE authenticated');
    const result = await fn();
    await client.query('RELEASE SAVEPOINT as_user');
    await client.query('RESET ROLE');
    return result;
  } catch (err) {
    // ROLLBACK TO SAVEPOINT also undoes the SET LOCAL ROLE / set_config
    // above (GUC changes participate in subtransaction rollback), so the
    // role is already back to the superuser afterward.
    await client.query('ROLLBACK TO SAVEPOINT as_user');
    throw err;
  }
}

/**
 * Creates an auth.users row (firing handle_new_user(), which creates the
 * matching `profiles` row), then sets is_staff/is_coach directly. Must be
 * called as the superuser (i.e. before any `asUser` call in the same test).
 */
export async function createProfile(
  client: PoolClient,
  opts: { email: string; isStaff?: boolean; isCoach?: boolean }
): Promise<string> {
  const id = randomUUID();
  await client.query('insert into auth.users (id, email) values ($1, $2)', [id, opts.email]);
  await client.query('update profiles set is_staff = $2, is_coach = $3 where id = $1', [
    id,
    opts.isStaff ?? false,
    opts.isCoach ?? false,
  ]);
  return id;
}

/** Grants a role directly (as superuser, bypassing user_roles RLS) for test setup. */
export async function grantRole(client: PoolClient, userId: string, role: string): Promise<void> {
  await client.query('insert into user_roles (user_id, role) values ($1, $2)', [userId, role]);
}
