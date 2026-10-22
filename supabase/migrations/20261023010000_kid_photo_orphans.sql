-- Orphaned kid photo uploads (ENG-21 / ENG-23).
--
-- A photo is uploaded before it is attached to a kid, so an abandoned form
-- leaves an object nothing points at, and a replaced photo the replacer was not
-- allowed to delete (a parent replacing one an Admin uploaded) does too. A
-- daily job (`/api/cron/kid-photos`) removes them, and this lists which: the
-- objects in the bucket that no kid references and that are older than a day.
-- The age is a grace period for an upload still waiting to be attached, such as
-- a parent who is partway through the registration form.
--
-- Postgres cannot delete the objects itself (storage.protect_delete() refuses
-- direct deletes), so this only names them and the job deletes them through the
-- Storage API.
--
-- Callable by the service role only, and SECURITY INVOKER on purpose: if a grant
-- ever slipped, RLS would still limit what a caller sees. The service role is
-- used by the cron route on the server and never reaches a browser.

CREATE OR REPLACE FUNCTION public.kid_photo_orphans(p_older_than interval DEFAULT interval '24 hours')
 RETURNS TABLE(name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select o.name
    from storage.objects o
   where o.bucket_id = 'kid-photos'
     and o.created_at < now() - p_older_than
     and not exists (select 1 from kids k where k.photo_path = o.name)
   order by o.created_at
   limit 500;
$function$;

REVOKE ALL ON FUNCTION public.kid_photo_orphans(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kid_photo_orphans(interval) TO service_role;
