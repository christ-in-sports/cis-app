-- Guards on user_roles for the Admin role-assignment screen (ENG-16, PR 2).
--
-- user_roles is already writable by Admin only ("admin manage roles"). Two things
-- the table policy cannot express are enforced here, in the database, because the
-- screen's own checks are UX only:
--
--   1. An Admin cannot remove their OWN admin role. Without this, one stray tick
--      could leave nobody able to open the screen again (recovery would be SQL).
--      Only auth.uid() matching the row is blocked, so another Admin can still
--      remove it, and system deletes (auth.uid() is null: the profile cascade,
--      service role, migrations, tests) are unaffected.
--   2. granted_by is stamped from the caller, not trusted from the request, so the
--      audit trail cannot be forged by an Admin writing someone else's id.

CREATE OR REPLACE FUNCTION public.guard_user_roles_self_lockout()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.role = 'admin' and old.user_id = auth.uid() then
    raise exception 'You cannot remove your own admin role'
      using errcode = '23001';
  end if;
  return old;
end $function$;

CREATE TRIGGER user_roles_self_lockout
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles_self_lockout();

CREATE OR REPLACE FUNCTION public.stamp_user_roles_granted_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null then
    new.granted_by := auth.uid();
  end if;
  return new;
end $function$;

CREATE TRIGGER user_roles_stamp_granted_by
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.stamp_user_roles_granted_by();

-- Trigger functions do not need to be callable through the API (see
-- 20261008120000_revoke_trigger_function_execute.sql).
REVOKE EXECUTE ON FUNCTION public.guard_user_roles_self_lockout() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_user_roles_granted_by() FROM PUBLIC, anon, authenticated;
