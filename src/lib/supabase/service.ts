import { createClient } from '@supabase/supabase-js';

/**
 * A Supabase client with the service role, which bypasses RLS. Server only: never
 * import it from a client component, and never pass the key or this client to one.
 *
 * Use it only where a signed-in user's own session cannot do the job. Today that
 * is granting the Parent role after someone proves they own an email (the parent
 * join link, `docs/arch_decisions.md` 2026-10-25), because `user_roles` is
 * writable by Admins only. Returns null when the environment is not configured.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
