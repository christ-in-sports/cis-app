-- Roles cleanup (ENG-16): every permission check names the exact role it means.
--
-- Context: attendance and season policies still called is_staff() ("admin") and
-- is_coach() ("admin or coach"), two ambiguous helpers kept over from before the
-- six-role model (20260922040530_roles.sql). Signup also only set the legacy
-- profiles.is_staff / is_coach flags and never wrote user_roles, and the
-- "Users can update own profile" policy has no column restriction, so any
-- signed-in user could set those flags on themselves.
--
-- This migration:
--   1. backfills user_roles from the flags, so nobody loses access;
--   2. rewrites every live policy and function that used the helpers to call
--      has_role() directly, with identical behaviour:
--        is_staff() -> has_role('admin')
--        is_coach() -> has_role('admin') or has_role('coach')
--   3. makes handle_new_user() create the profile only (new accounts start with
--      no role; an Admin grants roles afterwards);
--   4. drops is_staff(), is_coach() and the two profiles flag columns.
--
-- The DROPs at the end are deliberately not CASCADE: if anything still depends
-- on a helper or a column, this migration fails instead of silently dropping it.

-- ---------------------------------------------------------------------------
-- 1. Backfill user_roles from the legacy flags (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles WHERE is_staff
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'coach'::public.app_role FROM public.profiles WHERE is_coach
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2a. Policies
-- ---------------------------------------------------------------------------

DROP POLICY "read days" ON public.attendance_days;
DROP POLICY "staff days" ON public.attendance_days;
CREATE POLICY "read days" ON public.attendance_days AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('coach'));
CREATE POLICY "staff days" ON public.attendance_days AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role('admin')) WITH CHECK (has_role('admin'));

DROP POLICY "read groups" ON public.attendance_groups;
DROP POLICY "staff groups" ON public.attendance_groups;
CREATE POLICY "read groups" ON public.attendance_groups AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('coach'));
CREATE POLICY "staff groups" ON public.attendance_groups AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role('admin')) WITH CHECK (has_role('admin'));

-- "mark records" goes through can_mark(), rewritten below.
DROP POLICY "read records" ON public.attendance_records;
DROP POLICY "staff delete records" ON public.attendance_records;
DROP POLICY "staff insert records" ON public.attendance_records;
CREATE POLICY "read records" ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('coach'));
CREATE POLICY "staff delete records" ON public.attendance_records AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role('admin'));
CREATE POLICY "staff insert records" ON public.attendance_records AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_role('admin'));

DROP POLICY "read seasons" ON public.seasons;
DROP POLICY "staff seasons" ON public.seasons;
CREATE POLICY "read seasons" ON public.seasons AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('coach'));
CREATE POLICY "staff seasons" ON public.seasons AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role('admin')) WITH CHECK (has_role('admin'));

DROP POLICY "read team coaches" ON public.team_coaches;
DROP POLICY "staff team coaches" ON public.team_coaches;
CREATE POLICY "read team coaches" ON public.team_coaches AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('coach'));
CREATE POLICY "staff team coaches" ON public.team_coaches AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role('admin')) WITH CHECK (has_role('admin'));

-- ---------------------------------------------------------------------------
-- 2b. Functions (signatures, SECURITY DEFINER and search_path unchanged)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_mark(p_reg uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_role('admin') or exists (
    select 1
      from registrations r
      join team_coaches tc on tc.team_id = r.team_id
     where r.id = p_reg
       and tc.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.attendance_summary(p_season uuid DEFAULT NULL::uuid)
 RETURNS TABLE(registration_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid, team_name text, eligible integer, present integer, late integer, absent integer, excused integer, unmarked integer, attended integer, pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (
    select coalesce(p_season, (select id from seasons where is_current limit 1)) as id
  ),
  d as (
    select ad.id from attendance_days ad, s where ad.season_id = s.id
  )
  select
    r.id, k.first_name, k.last_name, r.grade, r.division, r.team_id, t.name,
    count(ar.id)::int,
    count(*) filter (where ar.status = 'present')::int,
    count(*) filter (where ar.status = 'late')::int,
    count(*) filter (where ar.status = 'absent')::int,
    count(*) filter (where ar.status = 'excused')::int,
    count(*) filter (where ar.status = 'unmarked')::int,
    count(*) filter (where ar.status in ('present','late'))::int,
    case
      when count(ar.id) filter (where ar.status <> 'unmarked') = 0 then 0
      else round(
        100.0 * count(*) filter (where ar.status in ('present','late'))
              / count(ar.id) filter (where ar.status <> 'unmarked'), 1)
    end
  from registrations r
  join kids k on k.id = r.kid_id
  left join ministry_teams t on t.id = r.team_id
  left join attendance_records ar
         on ar.registration_id = r.id
        and ar.day_id in (select id from d)
  where (public.has_role('admin') or public.has_role('coach'))  -- security definer: gate explicitly
    and r.active
    and r.season_id = (select id from s)
  group by r.id, k.first_name, k.last_name, r.grade, r.division, r.team_id, t.name
  order by 13 desc, k.last_name, k.first_name;
$function$;

CREATE OR REPLACE FUNCTION public.populate_attendance_day(p_day uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g record; n int;
begin
  -- SECURITY DEFINER bypasses RLS, so the check has to be explicit here.
  if not (public.has_role('admin') or public.has_role('coach')) then
    raise exception 'Coach or staff only';
  end if;

  select d.id as day_id, d.season_id, ag.session, ag.grade_min, ag.grade_max,
         ag.include_ids, ag.exclude_ids
    into g
    from attendance_days d
    join attendance_groups ag on ag.id = d.group_id
   where d.id = p_day;

  if not found then
    raise exception 'attendance day % not found', p_day;
  end if;

  insert into attendance_records (day_id, registration_id)
  select g.day_id, r.id
    from registrations r
   where r.active
     -- season_id is nullable on attendance_days; when it is unset, fall back to
     -- matching any season rather than silently populating an empty roster.
     and (g.season_id is null or r.season_id = g.season_id)
     and not (r.id = any(g.exclude_ids))
     and (
           r.id = any(g.include_ids)
        or (
             (g.session   is null or r.division = g.session)
         and (g.grade_min is null or r.grade >= g.grade_min)
         and (g.grade_max is null or r.grade <= g.grade_max)
           )
     )
  on conflict (day_id, registration_id) do nothing;

  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.start_new_season(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old_id uuid; new_id uuid;
begin
  if not public.has_role('admin') then
    raise exception 'Staff only';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Season name is required';
  end if;
  if exists (select 1 from seasons where lower(name) = lower(trim(p_name))) then
    raise exception 'A season named "%" already exists', trim(p_name);
  end if;

  select id into old_id from seasons where is_current limit 1;

  if old_id is not null then
    update seasons
       set is_current = false,
           ends_on = coalesce(ends_on, current_date)
     where id = old_id;
  end if;

  insert into seasons (name, is_current, starts_on)
  values (trim(p_name), true, current_date)
  returning id into new_id;

  return new_id;
end $function$;

-- ---------------------------------------------------------------------------
-- 3. New accounts start with no role
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '')
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = coalesce(excluded.display_name, profiles.display_name);

  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Drop the legacy helpers and flag columns (no CASCADE on purpose)
-- ---------------------------------------------------------------------------

DROP FUNCTION public.is_coach();
DROP FUNCTION public.is_staff();

ALTER TABLE public.profiles DROP COLUMN is_staff;
ALTER TABLE public.profiles DROP COLUMN is_coach;
