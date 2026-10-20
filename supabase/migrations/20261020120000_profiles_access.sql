-- Lock down public.profiles (ENG-16, PR 2).
--
-- Context: the baseline schema (from the tournament prototype this app grew out
-- of) made every profile readable by everyone: "Profiles viewable by everyone",
-- FOR SELECT TO public USING (true), with SELECT also granted to `anon`. The anon
-- key is public (it ships in the browser bundle), so anyone, signed in or not,
-- could list every account's email and display name through
-- /rest/v1/profiles. That list now includes every servant and parent who signs
-- up, which is a ready-made target list for phishing a church's families.
--
-- Also, "Users can update own profile" had no column restriction, so a user could
-- rewrite their own `email`. The roles screen shows that email to an Admin when
-- they decide who to give a role, so a spoofed email could mislead them. `email`
-- is a mirror of auth.users.email, kept by handle_new_user() and
-- sync_profile_from_meta() (both SECURITY DEFINER), never something a user edits.
--
-- After this migration:
--   * a signed-in user reads only their own profile row; an Admin reads all;
--   * `anon` has no access to profiles at all;
--   * a signed-in user may update only their own display_name;
--   * nobody can insert, delete or truncate profiles through the API (profiles
--     are created by the auth trigger and removed by the auth.users cascade).
--
-- The only app readers of profiles are Admin-only screens (the roles screen and
-- the team coach picker), so nothing a non-Admin does today depends on reading
-- other people's profiles. If a screen later needs another person's name, add a
-- narrow view or policy for that screen rather than reopening this table.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

DROP POLICY "Profiles viewable by everyone" ON public.profiles;
DROP POLICY "Users can update own profile" ON public.profiles;

CREATE POLICY "read own profile or admin" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = auth.uid() OR has_role('admin'));

CREATE POLICY "update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (least privilege; RLS above is the row boundary, these are the floor)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;
-- Column-level, so `email` and `id` cannot be updated through the API.
GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;
