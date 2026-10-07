-- Remove the prototype Tournament module's schema (ENG-11).
--
-- Context: before the PRD and project spec existed, a prototype "Tournament"
-- module was built straight in the Supabase dashboard (captured in
-- 20260921200000_remote_baseline.sql). It is being replaced by a season-scoped
-- sports competition feature (ENG-10). Everything in it is test data, so the
-- tables are dropped rather than migrated.
--
-- This also closes two privilege-escalation holes that exist in production:
--
--   1. "Users can join tournaments" on tournament_members only checks
--      auth.uid() = user_id. The client sends role = 'viewer', but nothing
--      enforces it, so any signed-in user could insert themselves as 'owner' of
--      any tournament.
--   2. "Admins can update members" and "Admins can delete members" test
--      tournament_id IN get_my_tournament_ids(), which returns every
--      tournament the caller belongs to whatever their role. Any viewer could
--      therefore change their own role to 'admin' or delete other members.
--
-- Once someone is a tournament admin, every other tournament table's "Admins
-- manage ..." policy lets them rewrite matches, scores and standings.
--
-- Dependencies: no function, view or policy outside this set references these
-- tables (checked against the baseline and every later migration), so CASCADE
-- only reaches objects inside it. Dropping a table also removes it from the
-- supabase_realtime publication; attendance_records is not touched and stays in
-- it. ministry_teams and team_coaches are NOT part of the prototype -- the
-- attendance and registration features use them -- and are left alone.
--
-- Not reversible without restoring from the baseline, which is deliberate.

DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.overall_standings CASCADE;
DROP TABLE IF EXISTS public.standings CASCADE;
DROP TABLE IF EXISTS public.match_scores CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.game_days CASCADE;
DROP TABLE IF EXISTS public.sports CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.tournament_members CASCADE;
DROP TABLE IF EXISTS public.tournaments CASCADE;

DROP FUNCTION IF EXISTS public.get_my_tournament_ids();
