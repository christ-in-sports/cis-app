-- Kid + per-season Registration schema (ENG-5 PR 3 of N).
--
-- Context: project_spec.md 2.4 specifies a `Kid` (stable identity, contact and
-- medical data) plus a per-season `Registration` (grade, division, T-shirt size,
-- top sports, consent, team). The live schema instead had a single flat
-- `registrations` table -- one row per kid, no season concept -- so a kid who
-- returns next season had nowhere to go, and `team_id` would point at last
-- season's team. docs/arch_decisions.md (2026-09-21) records the decision to
-- split them.
--
-- This migration REPLACES the flat table rather than migrating it. The 144 rows
-- it held were confirmed as dummy test data on 2026-09-22 and will be re-imported
-- cleanly through the CSV importer this ticket is building. Note this also
-- discards the `attendance` jsonb mirror on those rows; `attendance_records`
-- was empty, so no attendance history that anything reads is lost.
--
-- Known breakage, accepted deliberately (2026-09-22 decision): five database
-- functions read columns that no longer exist and will raise when called --
-- `check_in_by_token` (qr_token), `attendance_summary` (first_name/session),
-- `populate_attendance_day` (session/grade), `start_new_season` and
-- `sync_attendance_json` (the attendance jsonb columns). They are left in place
-- to be rewritten under their own tickets. Two exceptions are handled here:
--   * `sync_attendance_json` is a TRIGGER on attendance_records, so leaving it
--     attached would make every attendance write fail hard rather than merely
--     degrade. The trigger is dropped; the function is left for its ticket.
--   * `can_mark()` survives untouched -- it only reads registrations.id and
--     registrations.team_id, both of which still exist -- so the
--     `attendance_records` UPDATE policy that calls it keeps working.

-- ---------------------------------------------------------------------------
-- Tear down the flat table
-- ---------------------------------------------------------------------------

-- Would write to registrations.attendance, which ceases to exist below.
DROP TRIGGER IF EXISTS attendance_records_sync ON public.attendance_records;

-- Re-created further down against the new registrations table.
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_registration_id_fkey;

DROP TABLE IF EXISTS public.registrations;

-- ---------------------------------------------------------------------------
-- kids -- stable identity, carried across seasons
-- ---------------------------------------------------------------------------

CREATE TABLE public.kids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  dob date NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  -- Object path inside the private kid-photos bucket, never a URL
  -- (docs/arch_decisions.md 2026-09-21). Nullable: the CSV importer copies
  -- photos from Google Drive in a later PR, blocked on Drive API access.
  photo_path text,
  -- The kid's own contact details are optional; the guardian's are not.
  email text,
  phone text,
  allergies text,
  home_address text NOT NULL,
  emergency_contact_name text NOT NULL,
  emergency_contact_phone text NOT NULL,
  guardian_name text NOT NULL,
  guardian_phone text NOT NULL,
  guardian_email text NOT NULL,
  skill_tags text[] NOT NULL DEFAULT '{}',
  -- Nullable so a kid can exist (e.g. from CSV import) before the parent has an
  -- account; linked later when a user signs up with a matching guardian_email
  -- (project_spec.md 2.4).
  parent_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Returning-kid matching key for the CSV importer: first name + last name + DOB,
-- case-insensitive and whitespace-trimmed (project_spec.md 2.5).
--
-- Deliberately NOT unique, unlike the flat table's `registrations_identity_key`.
-- Twins legitimately share all three values, and a unique constraint would abort
-- an entire import commit on a real-world roster. The importer instead treats
-- more than one match as a row-level error for an Admin to resolve.
CREATE INDEX kids_identity_idx
  ON public.kids (lower(trim(first_name)), lower(trim(last_name)), dob);

CREATE INDEX kids_parent_idx ON public.kids (parent_user_id);
CREATE INDEX kids_last_name_idx ON public.kids (lower(last_name));

CREATE TRIGGER kids_touch
  BEFORE UPDATE ON public.kids
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- registrations -- one row per kid per season
-- ---------------------------------------------------------------------------

CREATE TABLE public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id uuid NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  grade integer NOT NULL,
  division text NOT NULL,
  tshirt_size text NOT NULL,
  top_sports text[],
  -- Null means no consent recorded. CSV-imported registrations may leave this
  -- null for now; the parent form (ENG-4) always sets it. See docs/decisions.md
  -- 2026-09-21.
  consent_given_at timestamp with time zone,
  consent_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.ministry_teams(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'import',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT registrations_kid_season_key UNIQUE (kid_id, season_id),
  CONSTRAINT registrations_grade_range CHECK (grade BETWEEN 4 AND 12),
  CONSTRAINT registrations_division_values
    CHECK (division IN ('juniors', 'ambassadors')),
  CONSTRAINT registrations_tshirt_size_values
    CHECK (tshirt_size IN ('YS', 'YM', 'YL', 'XS', 'S', 'M', 'L', 'XL', 'XXL')),
  -- Grade below 7 must be Juniors, above 7 must be Ambassadors, and grade 7 may
  -- choose either (project_spec.md 1.1, docs/decisions.md 2026-09-21). Enforced
  -- in the database because registrations arrive by three different paths --
  -- parent form, kid self-registration and CSV import -- so validating only in
  -- the form would let bad rows in through the others
  -- (docs/arch_decisions.md 2026-09-21).
  CONSTRAINT registrations_division_matches_grade CHECK (
    (grade < 7 AND division = 'juniors')
    OR (grade > 7 AND division = 'ambassadors')
    OR grade = 7
  )
);

CREATE INDEX registrations_kid_idx ON public.registrations (kid_id);
CREATE INDEX registrations_season_idx ON public.registrations (season_id);
CREATE INDEX registrations_team_idx ON public.registrations (team_id);
CREATE INDEX registrations_division_idx ON public.registrations (division);
CREATE INDEX registrations_grade_idx ON public.registrations (grade);

CREATE TRIGGER registrations_touch
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Attendance is per season, so it hangs off the season registration, not the kid.
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_registration_id_fkey
  FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Access helpers
--
-- SECURITY DEFINER for the same reason as the existing can_mark(): these are
-- called from inside RLS policies and must read the underlying tables without
-- recursing back through the policies they are being used to enforce.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.coaches_kid(p_kid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from registrations r
      join team_coaches tc on tc.team_id = r.team_id
     where r.kid_id = p_kid
       and tc.user_id = auth.uid()
  );
$function$;

-- The single source of truth for "who may see this kid", per the Role Permission
-- Matrix (project_spec.md 1.5): Admin and Program Team see the full roster, a
-- Coach sees kids on their own team, and a Parent sees their own kids.
--
-- Program Team is included deliberately. This REVERSES docs/decisions.md
-- (2026-09-21), which had Program Team unable to see home address and emergency
-- contact. Per the 2026-09-22 decision, Program Team may see them. That also
-- dissolves project_spec.md 2.8's open question about column-level access: the
-- contact-field reader set no longer differs from the roster reader set, so a
-- plain row-level policy suffices and the proposed 1:1 KidContact table is not
-- needed.
CREATE OR REPLACE FUNCTION public.can_read_kid(p_kid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.has_role('admin')
    or public.has_role('program')
    or public.coaches_kid(p_kid)
    or exists (
      select 1 from kids k
       where k.id = p_kid
         and k.parent_user_id = auth.uid()
    );
$function$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Only Admin may write. ENG-5 states the CSV import is Admin-only and that
-- Program Team does not get it; the Role Permission Matrix likewise gives
-- "Update full roster" to Admin alone.
-- ---------------------------------------------------------------------------

ALTER TABLE public.kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read kids" ON public.kids
  FOR SELECT TO authenticated
  USING (public.can_read_kid(id));

CREATE POLICY "admin manage kids" ON public.kids
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE POLICY "read registrations" ON public.registrations
  FOR SELECT TO authenticated
  USING (public.can_read_kid(kid_id));

CREATE POLICY "admin manage registrations" ON public.registrations
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Rewrite the attendance functions the app actually calls
--
-- These three are invoked from the UI (populate_attendance_day from
-- attendance-client and take-client, attendance_summary from summary/page and
-- summary-client, start_new_season from summary-client), so leaving them
-- pointing at the dropped flat table would take the whole attendance module down
-- rather than merely leave stale code. `check_in_by_token` is NOT rewritten here:
-- nothing calls it (there is no QR UI yet) and it needs a decision about where
-- the token should live now, so it stays deferred to its own ticket.
-- ---------------------------------------------------------------------------

-- Names now come from `kids`; grade is an integer and division replaces session.
-- Also newly scoped to the season -- the flat table had no season concept, so the
-- old version summarised every registration that existed regardless of season.
-- Column order and the `order by 13` (unmarked, descending) are preserved from
-- the original so the calling UI sees identical ordering semantics.
--
-- Dropped first rather than CREATE OR REPLACE'd: the return type changes (grade
-- becomes integer, session becomes division), and Postgres refuses to replace a
-- function whose OUT-parameter row type differs.
DROP FUNCTION IF EXISTS public.attendance_summary(uuid);

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
  where public.is_coach()          -- security definer: gate explicitly
    and r.active
    and r.season_id = (select id from s)
  group by r.id, k.first_name, k.last_name, r.grade, r.division, r.team_id, t.name
  order by 13 desc, k.last_name, k.first_name;
$function$;

-- grade is an integer now, so the grade_num() text parsing is gone, and the
-- group's `session` column is compared against registrations.division. Also
-- scoped to the day's season, which matters now that a kid has one registration
-- per season rather than a single lifetime row.
CREATE OR REPLACE FUNCTION public.populate_attendance_day(p_day uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g record; n int;
begin
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

-- Simpler than before: the old version had to copy each kid's attendance jsonb
-- into an archive keyed by season name and then clear it, because a single flat
-- row had to represent every season at once. Attendance now lives in
-- attendance_records, which reaches its season through attendance_days, so past
-- seasons are preserved by construction and nothing needs archiving.
CREATE OR REPLACE FUNCTION public.start_new_season(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old_id uuid; new_id uuid;
begin
  if not public.is_staff() then
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
-- Private photo storage
--
-- Photos of minors: private bucket, object paths only, short-lived signed URLs
-- on read (docs/arch_decisions.md 2026-09-21).
--
-- Object naming convention, relied on by the read policy below:
--     <kid_id>/<filename>
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('kid-photos', 'kid-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Resolves an object path to its kid and applies the same read rule as the kids
-- table. plpgsql with an exception block because a malformed path must deny
-- rather than raise -- a raise inside a policy would surface as a 500 instead of
-- an empty result.
CREATE OR REPLACE FUNCTION public.can_read_kid_photo(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k uuid;
begin
  begin
    k := (storage.foldername(p_path))[1]::uuid;
  exception when others then
    return false;
  end;

  if k is null then
    return false;
  end if;

  return public.can_read_kid(k);
end $function$;

CREATE POLICY "read kid photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kid-photos' AND public.can_read_kid_photo(name));

CREATE POLICY "admin manage kid photos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'kid-photos' AND public.has_role('admin'))
  WITH CHECK (bucket_id = 'kid-photos' AND public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- A current season must exist before anything can be registered, since
-- registrations.season_id is NOT NULL. Conditional so this is a no-op wherever
-- a current season is already set.
-- ---------------------------------------------------------------------------

INSERT INTO public.seasons (name, is_current, starts_on)
SELECT 'CIS 2026-2027', true, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.seasons WHERE is_current);
