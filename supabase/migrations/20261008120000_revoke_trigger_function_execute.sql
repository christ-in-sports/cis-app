-- Take trigger functions off the public API (ENG-14).
--
-- The Supabase security advisor flagged three SECURITY DEFINER trigger functions
-- as executable by `anon` and `authenticated` through /rest/v1/rpc/:
--
--   guard_sport_block_shape()  (20261008000000_competition_schema.sql)
--   set_team_season()          (20261008000000_competition_schema.sql)
--   set_day_season()           (20260921200000_remote_baseline.sql)
--
-- Postgres grants EXECUTE to PUBLIC by default, which is what exposes them.
-- They are only ever meant to run as triggers, so calling one directly is
-- harmless (Postgres refuses: "trigger functions can only be called as
-- triggers") -- but nothing should be reachable that need not be.
--
-- Safe to revoke: a trigger runs regardless of whether the user who fired it
-- holds EXECUTE on the trigger function. EXECUTE is checked once, when the
-- trigger is created, by the migration's own role. supabase/tests/competition.test.ts
-- covers it: an Admin still inserts a team, which fires set_team_season().
--
-- Not touched here: the other SECURITY DEFINER functions the advisor lists that
-- are callable by `anon` (has_role, is_staff, can_read_kid, check_in_by_token,
-- start_new_season, ...). Those predate this work and several are used by
-- policies or RPCs the app calls, so they need their own review.

REVOKE ALL ON FUNCTION public.guard_sport_block_shape() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_team_season() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_day_season() FROM PUBLIC, anon, authenticated;
