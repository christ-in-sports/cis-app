-- A team link never grants a role (AGENTS.md section 4). coaches_kid() only checked
-- team_coaches, so a user whose Coach role was revoked kept reading their old
-- team's kids and registrations through can_read_kid(). Require the role too.
-- This narrows existing access: stale team_coaches rows of non-Coaches now grant nothing.
CREATE OR REPLACE FUNCTION public.coaches_kid(p_kid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_role('coach') and exists (
    select 1
      from registrations r
      join team_coaches tc on tc.team_id = r.team_id
     where r.kid_id = p_kid
       and tc.user_id = auth.uid()
  );
$function$;

NOTIFY pgrst, 'reload schema';
