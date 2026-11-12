-- Existing leadership keeps all access under the new Director name.
-- New Admin grants share operational access, but never servant oversight or roles.
UPDATE public.user_roles SET role = 'director' WHERE role = 'admin';

-- Explicit policies: preserve command, role scope and ownership conditions.
ALTER POLICY "manage days" ON "public"."attendance_days" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) OR has_role('program'::app_role))) WITH CHECK (((public.has_role('director') OR public.has_role('admin')) OR has_role('program'::app_role)));

ALTER POLICY "read days" ON "public"."attendance_days" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) OR has_role('program'::app_role) OR has_role('coach'::app_role)));

ALTER POLICY "read groups" ON "public"."attendance_groups" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) OR has_role('coach'::app_role)));

ALTER POLICY "staff groups" ON "public"."attendance_groups" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "read records" ON "public"."attendance_records" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) OR has_role('program'::app_role) OR can_access_attendance_record(day_id, registration_id)));

ALTER POLICY "staff delete records" ON "public"."attendance_records" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) AND (EXISTS ( SELECT 1
   FROM attendance_days
  WHERE ((attendance_days.id = attendance_records.day_id) AND (NOT attendance_days.locked))))));

ALTER POLICY "staff insert records" ON "public"."attendance_records" TO "authenticated" WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "read own attendance team snapshots" ON "public"."attendance_team_snapshots" TO "authenticated" USING ((( SELECT (public.has_role('director') OR public.has_role('admin')) AS has_role) OR ( SELECT has_role('program'::app_role) AS has_role) OR (( SELECT has_role('coach'::app_role) AS has_role) AND (EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.team_id = attendance_team_snapshots.team_id) AND (tc.user_id = ( SELECT auth.uid() AS uid))))))));

ALTER POLICY "admin manage import batches" ON "public"."import_batches" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "admin manage import rows" ON "public"."import_rows" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "admin manage kids" ON "public"."kids" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "admin manage teams" ON "public"."ministry_teams" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "read payments" ON "public"."payments" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) OR (EXISTS ( SELECT 1
   FROM (registrations r
     JOIN kids k ON ((k.id = r.kid_id)))
  WHERE ((r.id = payments.registration_id) AND (k.parent_user_id = auth.uid()))))));

ALTER POLICY "read own profile or admin" ON "public"."profiles" TO "authenticated" USING (((id = auth.uid()) OR (public.has_role('director') OR public.has_role('admin'))));

ALTER POLICY "admin manage registrations" ON "public"."registrations" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "read seasons" ON "public"."seasons" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) OR has_role('coach'::app_role)));

ALTER POLICY "staff seasons" ON "public"."seasons" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "read own servant registration or admin" ON "public"."servant_registrations" TO "authenticated" USING ((public.has_role('director') OR ((user_id = auth.uid()) AND ((NOT (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE (ur.user_id = auth.uid())))) OR (public.has_role('admin') OR public.has_role('program')) OR has_role('coach'::app_role) OR has_role('prayer'::app_role)))));

ALTER POLICY "read team coaches" ON "public"."team_coaches" TO "authenticated" USING (((public.has_role('director') OR public.has_role('admin')) OR has_role('coach'::app_role)));

ALTER POLICY "staff team coaches" ON "public"."team_coaches" TO "authenticated" USING ((public.has_role('director') OR public.has_role('admin'))) WITH CHECK ((public.has_role('director') OR public.has_role('admin')));

ALTER POLICY "admin manage roles" ON "public"."user_roles" TO "authenticated" USING (public.has_role('director')) WITH CHECK (public.has_role('director'));

ALTER POLICY "read own roles" ON "public"."user_roles" TO "authenticated" USING (((auth.uid() = user_id) OR public.has_role('director')));

ALTER POLICY "delete unreferenced kid photos" ON "storage"."objects" TO "authenticated" USING (((bucket_id = 'kid-photos'::text) AND (NOT kid_photo_attached(name)) AND ((public.has_role('director') OR public.has_role('admin')) OR (owner_id = (( SELECT auth.uid() AS uid))::text))));

ALTER POLICY "read kid photos" ON "storage"."objects" TO "authenticated" USING (((bucket_id = 'kid-photos'::text) AND ((public.has_role('director') OR public.has_role('admin')) OR (EXISTS ( SELECT 1
   FROM kids k
  WHERE ((k.photo_path = objects.name) AND can_read_kid(k.id)))) OR ((owner_id = (( SELECT auth.uid() AS uid))::text) AND ((public.has_role('director') OR public.has_role('admin')) OR has_role('parent'::app_role)) AND (NOT kid_photo_attached(name))))));

ALTER POLICY "upload kid photos" ON "storage"."objects" TO "authenticated" WITH CHECK (((bucket_id = 'kid-photos'::text) AND ((public.has_role('director') OR public.has_role('admin')) OR has_role('parent'::app_role)) AND (owner_id = (( SELECT auth.uid() AS uid))::text) AND (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'::text)));

-- Recreate the affected functions with unchanged signatures, ownership, security
-- attributes and grants. Every operational check names both roles explicitly.
CREATE OR REPLACE FUNCTION public.archive_current_attendance()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT ((public.has_role('director') OR public.has_role('admin')) OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  -- Serialize rollover with assignment, creation and marking. A snapshot and
  -- clearing the live team assignment must commit together.
  LOCK TABLE registrations, ministry_teams, attendance_days, attendance_records IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO attendance_team_snapshots(registration_id, team_id)
    SELECT r.id, r.team_id FROM registrations r JOIN ministry_teams t ON t.id = r.team_id WHERE t.active
    ON CONFLICT DO NOTHING;
  INSERT INTO attendance_team_snapshots(day_id, registration_id, team_id)
    SELECT ar.day_id, ar.registration_id, r.team_id
    FROM attendance_records ar JOIN registrations r ON r.id = ar.registration_id
    JOIN attendance_days d ON d.id = ar.day_id
    WHERE d.archived_at IS NULL AND NOT d.roster_frozen
    ON CONFLICT (day_id, registration_id) DO NOTHING;
  UPDATE attendance_days SET archived_at = now(), locked = true, roster_frozen = true WHERE archived_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE ministry_teams SET archived_at = now(), active = false WHERE active;
  UPDATE registrations SET team_id = NULL
    WHERE team_id IN (SELECT id FROM ministry_teams WHERE archived_at IS NOT NULL);
  RETURN n;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.archived_attendance_team_roster()
 RETURNS TABLE(id uuid, kid_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT r.id, r.kid_id, k.first_name, k.last_name, r.grade, r.division, s.team_id
  FROM attendance_team_snapshots s JOIN ministry_teams t ON t.id = s.team_id
  JOIN registrations r ON r.id = s.registration_id JOIN kids k ON k.id = r.kid_id
  WHERE s.day_id IS NULL AND t.archived_at IS NOT NULL AND ((public.has_role('director') OR public.has_role('admin')) OR has_role('program'));
$function$
;

CREATE OR REPLACE FUNCTION public.assign_attendance_team(p_registrations uuid[], p_team uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT ((public.has_role('director') OR public.has_role('admin')) OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  IF cardinality(p_registrations) IS NULL OR cardinality(p_registrations) = 0 THEN
    RAISE EXCEPTION 'Select at least one kid';
  END IF;
  -- Lock the selected rows and target team before checking season/division.
  PERFORM 1 FROM registrations WHERE id = ANY(p_registrations) FOR UPDATE;
  PERFORM 1 FROM ministry_teams WHERE id = p_team FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM unnest(p_registrations) ids(id)
    LEFT JOIN registrations r ON r.id = ids.id
    WHERE r.id IS NULL OR NOT r.active OR r.season_id <> attendance_roster_season()
      OR (p_team IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ministry_teams t WHERE t.id = p_team AND t.active
          AND t.season_id = r.season_id AND t.division = r.division
      ))
  ) THEN RAISE EXCEPTION 'Choose active kids and a team in the same roster and division'; END IF;
  UPDATE registrations SET team_id = p_team WHERE id = ANY(p_registrations);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.attendance_archive_summary(p_archived boolean DEFAULT false)
 RETURNS TABLE(registration_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid, team_name text, eligible integer, present integer, late integer, absent integer, excused integer, unmarked integer, attended integer, pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH visible AS (
    SELECT ar.*, d.date, d.created_at,
      CASE WHEN d.roster_frozen THEN s.team_id ELSE r.team_id END AS roster_team
    FROM attendance_records ar JOIN attendance_days d ON d.id = ar.day_id
    JOIN registrations r ON r.id = ar.registration_id
    LEFT JOIN attendance_team_snapshots s ON s.day_id = ar.day_id AND s.registration_id = ar.registration_id
    WHERE (d.archived_at IS NOT NULL) = p_archived
      AND ((public.has_role('director') OR public.has_role('admin')) OR has_role('program') OR can_access_attendance_record(ar.day_id, ar.registration_id))
  ), totals AS (
    SELECT v.registration_id, (array_agg(v.roster_team ORDER BY v.date DESC, v.created_at DESC, v.day_id))[1] AS roster_team,
      count(*)::int AS eligible,
      count(*) FILTER (WHERE v.status = 'present')::int AS present,
      count(*) FILTER (WHERE v.status = 'late')::int AS late,
      count(*) FILTER (WHERE v.status = 'absent')::int AS absent,
      count(*) FILTER (WHERE v.status = 'excused')::int AS excused,
      count(*) FILTER (WHERE v.status = 'unmarked')::int AS unmarked,
      count(*) FILTER (WHERE v.status IN ('present','late'))::int AS attended
    FROM visible v GROUP BY v.registration_id
  )
  SELECT r.id, k.first_name, k.last_name, r.grade, r.division, t.roster_team, mt.name,
    t.eligible, t.present, t.late, t.absent, t.excused, t.unmarked, t.attended,
    CASE WHEN t.eligible = t.unmarked THEN 0 ELSE round(100.0 * t.attended / (t.eligible - t.unmarked), 1) END
  FROM totals t JOIN registrations r ON r.id = t.registration_id JOIN kids k ON k.id = r.kid_id
  LEFT JOIN ministry_teams mt ON mt.id = t.roster_team
  ORDER BY t.attended DESC, k.last_name, k.first_name;
$function$
;

CREATE OR REPLACE FUNCTION public.attendance_coach_options()
 RETURNS TABLE(id uuid, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, coalesce(nullif(trim(p.display_name), ''), 'Unnamed coach')
  FROM profiles p WHERE ((public.has_role('director') OR public.has_role('admin')) OR has_role('program'))
  AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'coach')
  ORDER BY 2, 1;
$function$
;

CREATE OR REPLACE FUNCTION public.attendance_day_roster(p_day uuid)
 RETURNS TABLE(id uuid, day_id uuid, registration_id uuid, status text, method text, marked_at timestamp with time zone, note text, kid_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ar.id, ar.day_id, ar.registration_id, ar.status, ar.method, ar.marked_at, ar.note,
    r.kid_id, k.first_name, k.last_name, r.grade, r.division,
    CASE WHEN d.roster_frozen THEN s.team_id ELSE r.team_id END
  FROM attendance_records ar JOIN attendance_days d ON d.id = ar.day_id
  JOIN registrations r ON r.id = ar.registration_id JOIN kids k ON k.id = r.kid_id
  LEFT JOIN attendance_team_snapshots s ON s.day_id = ar.day_id AND s.registration_id = ar.registration_id
  WHERE ar.day_id = p_day AND ((public.has_role('director') OR public.has_role('admin')) OR has_role('program') OR can_access_attendance_record(ar.day_id, ar.registration_id));
$function$
;

CREATE OR REPLACE FUNCTION public.attendance_roster_season()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id FROM seasons s
  WHERE (public.has_role('director') OR public.has_role('admin')) OR has_role('program') OR has_role('coach')
  ORDER BY EXISTS (SELECT 1 FROM registrations r WHERE r.season_id = s.id AND r.active) DESC,
    s.is_current DESC, s.starts_on DESC, s.id
  LIMIT 1;
$function$
;

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
  where ((public.has_role('director') OR public.has_role('admin')) or public.has_role('program') or public.can_mark(r.id))  -- security definer: gate explicitly
    and r.active
    and r.season_id = (select id from s)
  group by r.id, k.first_name, k.last_name, r.grade, r.division, r.team_id, t.name
  order by 13 desc, k.last_name, k.first_name;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_attendance_record(p_day uuid, p_registration uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (public.has_role('director') OR public.has_role('admin')) OR (has_role('coach') AND EXISTS (
    SELECT 1 FROM attendance_days d CROSS JOIN registrations r
    LEFT JOIN attendance_team_snapshots s ON s.day_id = p_day AND s.registration_id = r.id
    JOIN team_coaches tc ON tc.team_id = CASE WHEN d.roster_frozen THEN s.team_id ELSE r.team_id END
    WHERE d.id = p_day AND r.id = p_registration AND tc.user_id = auth.uid()
  ));
$function$
;

CREATE OR REPLACE FUNCTION public.can_mark(p_reg uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (public.has_role('director') OR public.has_role('admin')) OR (has_role('coach') AND EXISTS (
    SELECT 1 FROM registrations r JOIN team_coaches tc ON tc.team_id = r.team_id
    WHERE r.id = p_reg AND tc.user_id = auth.uid()
  ));
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_kid(p_kid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    (public.has_role('director') OR public.has_role('admin'))
    or public.has_role('program')
    or public.coaches_kid(p_kid)
    or exists (
      select 1 from kids k
       where k.id = p_kid
         and k.parent_user_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_score_competition()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (public.has_role('director') OR public.has_role('admin')) or public.has_role('program');
$function$
;

CREATE OR REPLACE FUNCTION public.create_attendance_date(p_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE source_season uuid; new_group uuid; new_day uuid;
BEGIN
  IF NOT ((public.has_role('director') OR public.has_role('admin')) OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Choose an attendance date'; END IF;
  source_season := attendance_roster_season();
  IF source_season IS NULL THEN RAISE EXCEPTION 'Add registrations before creating attendance'; END IF;
  INSERT INTO attendance_groups(name, created_by) VALUES ('Attendance', auth.uid()) RETURNING id INTO new_group;
  INSERT INTO attendance_days(group_id, date, season_id, created_by)
    VALUES (new_group, p_date, source_season, auth.uid()) RETURNING id INTO new_day;
  PERFORM populate_attendance_day(new_day);
  RETURN new_day;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_attendance_day(p_season uuid, p_date date, p_label text, p_division text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE group_id uuid; day_id uuid;
BEGIN
  IF NOT ((public.has_role('director') OR public.has_role('admin')) OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_season AND is_current) THEN
    RAISE EXCEPTION 'Choose the current season';
  END IF;
  IF p_date IS NULL OR coalesce(trim(p_label), '') = '' OR length(p_label) > 100
    OR (p_division IS NOT NULL AND p_division NOT IN ('juniors', 'ambassadors')) THEN
    RAISE EXCEPTION 'Check the session title, date and division';
  END IF;
  INSERT INTO attendance_groups(name, session, created_by)
    VALUES (trim(p_label), p_division, auth.uid()) RETURNING id INTO group_id;
  INSERT INTO attendance_days(group_id, date, season_id, created_by)
    VALUES (group_id, p_date, p_season, auth.uid()) RETURNING id INTO day_id;
  PERFORM populate_attendance_day(day_id);
  RETURN day_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_attendance_team(p_team uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT ((public.has_role('director') OR public.has_role('admin')) OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  LOCK TABLE registrations, ministry_teams IN SHARE ROW EXCLUSIVE MODE;
  UPDATE ministry_teams SET deleted_at = now(), active = false
    WHERE id = p_team AND active AND archived_at IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a current team'; END IF;
  UPDATE registrations SET team_id = NULL WHERE team_id = p_team;
  DELETE FROM team_coaches WHERE team_id = p_team;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_payment(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_registration_id uuid;
begin
  if not (public.has_role('director') OR public.has_role('admin')) then
    raise exception 'Only an Admin may remove payments'
      using errcode = '42501';
  end if;

  delete from payments
   where id = p_payment_id
  returning registration_id into v_registration_id;

  if v_registration_id is null then
    raise exception 'That payment no longer exists'
      using errcode = 'P0002';
  end if;

  return v_registration_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_user_roles_self_lockout()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.role = 'director' and old.user_id = auth.uid() then
    raise exception 'You cannot remove your own Director role'
      using errcode = '23001';
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.import_commit(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch       import_batches;
  v_row         import_rows;
  v_kid_id      uuid;
  v_match_count integer;
  v_first       text;
  v_last        text;
  v_dob         date;
  v_inserted    integer := 0;
  v_updated     integer := 0;
  v_ambiguous   integer := 0;
begin
  if not (public.has_role('director') OR public.has_role('admin')) then
    raise exception 'Only an Admin may commit an import'
      using errcode = '42501';
  end if;

  update import_batches
     set status = 'committing'
   where id = p_batch_id
     and status = 'ready'
  returning * into v_batch;

  if v_batch.id is null then
    raise exception 'Import batch % is not ready to commit', p_batch_id
      using errcode = '55000';
  end if;

  for v_row in
    select *
      from import_rows
     where batch_id = p_batch_id
       and parsed is not null
     order by row_number
  loop
    v_first := v_row.parsed -> 'kid' ->> 'first_name';
    v_last  := v_row.parsed -> 'kid' ->> 'last_name';
    v_dob   := (v_row.parsed -> 'kid' ->> 'dob')::date;

    select count(*), (array_agg(k.id order by k.id))[1]
      into v_match_count, v_kid_id
      from kids k
     where lower(trim(k.first_name)) = lower(trim(v_first))
       and lower(trim(k.last_name))  = lower(trim(v_last))
       and k.dob = v_dob;

    if v_match_count > 1 then
      update import_rows
         set action = 'error',
             matched_kid_id = null,
             errors = errors || jsonb_build_array(jsonb_build_object(
               'row', v_row.row_number,
               'column', null,
               'field', null,
               'message', format(
                 'Matches %s existing kids with the same name and date of birth; resolve before importing',
                 v_match_count)))
       where id = v_row.id;

      v_ambiguous := v_ambiguous + 1;
      continue;
    end if;

    if v_kid_id is null then
      insert into kids (
        first_name, last_name, dob, gender,
        email, phone, allergies,
        home_address, emergency_contact_name, emergency_contact_phone,
        guardian_name, guardian_phone, guardian_email, skill_tags
      )
      values (
        v_first,
        v_last,
        v_dob,
        v_row.parsed -> 'kid' ->> 'gender',
        v_row.parsed -> 'kid' ->> 'email',
        v_row.parsed -> 'kid' ->> 'phone',
        v_row.parsed -> 'kid' ->> 'allergies',
        v_row.parsed -> 'kid' ->> 'home_address',
        v_row.parsed -> 'kid' ->> 'emergency_contact_name',
        v_row.parsed -> 'kid' ->> 'emergency_contact_phone',
        v_row.parsed -> 'kid' ->> 'guardian_name',
        v_row.parsed -> 'kid' ->> 'guardian_phone',
        v_row.parsed -> 'kid' ->> 'guardian_email',
        coalesce(
          array(select jsonb_array_elements_text(v_row.parsed -> 'kid' -> 'skill_tags')),
          '{}')
      )
      returning id into v_kid_id;

      v_inserted := v_inserted + 1;

      update import_rows
         set action = 'insert', matched_kid_id = v_kid_id
       where id = v_row.id;
    else
      -- Required fields overwrite outright. Optional ones (email, phone,
      -- allergies) fall back to what is already stored, because a blank cell
      -- means "not answered", not "delete this" -- which matters most for
      -- allergies.
      update kids
         set first_name              = v_first,
             last_name               = v_last,
             gender                  = v_row.parsed -> 'kid' ->> 'gender',
             home_address            = v_row.parsed -> 'kid' ->> 'home_address',
             emergency_contact_name  = v_row.parsed -> 'kid' ->> 'emergency_contact_name',
             emergency_contact_phone = v_row.parsed -> 'kid' ->> 'emergency_contact_phone',
             guardian_name           = v_row.parsed -> 'kid' ->> 'guardian_name',
             guardian_phone          = v_row.parsed -> 'kid' ->> 'guardian_phone',
             guardian_email          = v_row.parsed -> 'kid' ->> 'guardian_email',
             email     = coalesce(v_row.parsed -> 'kid' ->> 'email', kids.email),
             phone     = coalesce(v_row.parsed -> 'kid' ->> 'phone', kids.phone),
             allergies = coalesce(v_row.parsed -> 'kid' ->> 'allergies', kids.allergies)
       where id = v_kid_id;

      v_updated := v_updated + 1;

      update import_rows
         set action = 'update', matched_kid_id = v_kid_id
       where id = v_row.id;
    end if;

    insert into registrations (
      kid_id, season_id, grade, division, tshirt_size, top_sports,
      source, created_by
    )
    values (
      v_kid_id,
      v_batch.season_id,
      (v_row.parsed -> 'registration' ->> 'grade')::integer,
      v_row.parsed -> 'registration' ->> 'division',
      v_row.parsed -> 'registration' ->> 'tshirt_size',
      case
        when jsonb_typeof(v_row.parsed -> 'registration' -> 'top_sports') = 'array'
        then array(select jsonb_array_elements_text(v_row.parsed -> 'registration' -> 'top_sports'))
        else null
      end,
      'import',
      v_batch.uploaded_by
    )
    on conflict (kid_id, season_id) do update
      set grade       = excluded.grade,
          division    = excluded.division,
          tshirt_size = excluded.tshirt_size,
          top_sports  = coalesce(excluded.top_sports, registrations.top_sports),
          active      = true;
  end loop;

  update import_batches
     set status = 'committed',
         committed_at = now()
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'inserted', v_inserted,
    'updated', v_updated,
    'ambiguous', v_ambiguous,
    'skipped_with_errors', v_batch.error_rows
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.populate_attendance_day(p_day uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g record; n integer;
BEGIN
  IF NOT ((public.has_role('director') OR public.has_role('admin')) OR has_role('program') OR has_role('coach')) THEN
    RAISE EXCEPTION 'Admin, Program or Coach only';
  END IF;
  SELECT d.*, ag.session, ag.grade_min, ag.grade_max, ag.include_ids, ag.exclude_ids
    INTO g FROM attendance_days d JOIN attendance_groups ag ON ag.id = d.group_id
    WHERE d.id = p_day FOR SHARE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance day not found'; END IF;
  IF g.locked THEN RAISE EXCEPTION 'Attendance day is locked'; END IF;
  IF g.season_id IS NULL THEN RAISE EXCEPTION 'Attendance needs a season'; END IF;
  INSERT INTO attendance_records(day_id, registration_id)
    SELECT p_day, r.id FROM registrations r
    WHERE r.active AND r.season_id = g.season_id
      AND ((public.has_role('director') OR public.has_role('admin')) OR has_role('program') OR can_mark(r.id))
      AND NOT (r.id = ANY(g.exclude_ids))
      AND (r.id = ANY(g.include_ids) OR (
        (g.session IS NULL OR r.division = g.session)
        AND (g.grade_min IS NULL OR r.grade >= g.grade_min)
        AND (g.grade_max IS NULL OR r.grade <= g.grade_max)))
    ON CONFLICT (day_id, registration_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_payments(p_registration_ids uuid[], p_amount_cents integer, p_method text)
 RETURNS TABLE(payment_id uuid, registration_id uuid, amount_cents integer, method text, received_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- The RETURNS TABLE names double as plpgsql variables; prefer the column.
#variable_conflict use_column
declare
  v_wanted integer;
  v_found integer;
begin
  -- SECURITY DEFINER bypasses the caller's RLS, so the check has to be here.
  if not (public.has_role('director') OR public.has_role('admin')) then
    raise exception 'Only an Admin may record payments'
      using errcode = '42501';
  end if;

  if p_registration_ids is null or array_length(p_registration_ids, 1) is null then
    raise exception 'No registrations given'
      using errcode = '22023';
  end if;

  -- Checked before inserting rather than by comparing row counts afterwards:
  -- the FK would reject an unknown id anyway, but as a 23503 that reads like a
  -- bug. A stale screen is the realistic cause, so say that.
  select count(distinct id), (select count(distinct x) from unnest(p_registration_ids) x)
    into v_found, v_wanted
    from registrations
   where id = any(p_registration_ids);

  if v_found <> v_wanted then
    raise exception 'Some registrations no longer exist'
      using errcode = 'P0002';
  end if;

  -- The amount and method CHECKs reject bad input with 23514. Duplicate ids in
  -- the array are collapsed, so a double-tick never records a payment twice.
  return query
  insert into payments as p (registration_id, amount_cents, method, received_at, recorded_by)
  select distinct ids.id, p_amount_cents, p_method, now(), auth.uid()
    from unnest(p_registration_ids) as ids(id)
  returning p.id, p.registration_id, p.amount_cents, p.method, p.received_at;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_kid_photo(p_kid uuid, p_path text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    (public.has_role('director') OR public.has_role('admin'))
    or (
      public.has_role('parent')
      and exists (
        select 1 from kids k
         where k.id = p_kid
           and k.parent_user_id = auth.uid()
      )
    )
  ) then
    raise exception 'Kid not found'
      using errcode = '42501';
  end if;

  return public.attach_kid_photo(p_kid, p_path);
end $function$
;

CREATE OR REPLACE FUNCTION public.set_registrations_consent(p_registration_ids uuid[], p_received boolean)
 RETURNS TABLE(registration_id uuid, consent_given_at timestamp with time zone, consent_by_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated integer;
begin
  -- SECURITY DEFINER bypasses the caller's RLS, so the check has to be here.
  if not (public.has_role('director') OR public.has_role('admin')) then
    raise exception 'Only an Admin may record consent'
      using errcode = '42501';
  end if;

  if p_registration_ids is null or array_length(p_registration_ids, 1) is null then
    raise exception 'No registrations given'
      using errcode = '22023';
  end if;

  return query
  update registrations r
     set consent_given_at   = case when p_received then now() else null end,
         consent_by_user_id = case when p_received then auth.uid() else null end
   where r.id = any(p_registration_ids)
  returning r.id, r.consent_given_at, r.consent_by_user_id;

  get diagnostics v_updated = row_count;

  -- Fewer rows than ids means at least one no longer exists -- a stale screen,
  -- or a registration removed between render and click. Raised rather than
  -- quietly succeeding, because the whole statement rolls back and the Admin
  -- would otherwise believe every form they just ticked had been recorded.
  if v_updated <> array_length(p_registration_ids, 1) then
    raise exception 'Some registrations no longer exist'
      using errcode = 'P0002';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.start_new_season(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old_id uuid; new_id uuid;
begin
  if not (public.has_role('director') OR public.has_role('admin')) then
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
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_servant_registration(p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_season uuid;
  v_email text;
  v_serving boolean;
  v_sessions text[] := '{}';
  v_juniors text[] := '{}';
  v_ambassadors text[] := '{}';
  v_juniors_other text;
  v_ambassadors_other text;
  v_is_new boolean;
begin
  -- SECURITY DEFINER bypasses the caller's RLS, so the gate has to be here.
  if v_uid is null then
    raise exception 'Sign in to register as a servant'
      using errcode = '42501';
  end if;

  -- Servants only: no role yet, or Admin, Program Team, Coach or Prayer Team.
  -- A Parent or Kid account is not a servant.
  if exists (select 1 from user_roles ur where ur.user_id = v_uid)
     and not (
       (public.has_role('director') OR public.has_role('admin'))
       or public.has_role('program')
       or public.has_role('coach')
       or public.has_role('prayer')
     ) then
    raise exception 'Servant registration is for servants'
      using errcode = '42501';
  end if;

  select s.id into v_season from seasons s where s.is_current;
  if v_season is null then
    raise exception 'There is no active season'
      using errcode = '55000';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  v_serving := (p->>'is_serving')::boolean;

  if v_serving then
    if jsonb_typeof(p->'sessions') = 'array' then
      v_sessions := array(select jsonb_array_elements_text(p->'sessions'));
    end if;
    if jsonb_typeof(p->'juniors_subteams') = 'array' then
      v_juniors := array(select jsonb_array_elements_text(p->'juniors_subteams'));
    end if;
    if jsonb_typeof(p->'ambassadors_subteams') = 'array' then
      v_ambassadors := array(select jsonb_array_elements_text(p->'ambassadors_subteams'));
    end if;
    v_juniors_other := nullif(trim(p->>'juniors_other'), '');
    v_ambassadors_other := nullif(trim(p->>'ambassadors_other'), '');
  end if;

  insert into servant_registrations (
    user_id, season_id,
    full_name, evaluation_status, is_serving,
    sessions, juniors_subteams, ambassadors_subteams, juniors_other, ambassadors_other,
    notes, dates_missing,
    email, phone, emergency_contact_name, emergency_contact_phone,
    gender, dob, home_address
  ) values (
    v_uid, v_season,
    trim(p->>'full_name'),
    p->>'evaluation_status',
    v_serving,
    v_sessions, v_juniors, v_ambassadors, v_juniors_other, v_ambassadors_other,
    nullif(trim(p->>'notes'), ''),
    nullif(trim(p->>'dates_missing'), ''),
    v_email,
    trim(p->>'phone'),
    trim(p->>'emergency_contact_name'),
    trim(p->>'emergency_contact_phone'),
    p->>'gender',
    (p->>'dob')::date,
    trim(p->>'home_address')
  )
  on conflict (user_id, season_id) do update
    set full_name = excluded.full_name,
        evaluation_status = excluded.evaluation_status,
        is_serving = excluded.is_serving,
        sessions = excluded.sessions,
        juniors_subteams = excluded.juniors_subteams,
        ambassadors_subteams = excluded.ambassadors_subteams,
        juniors_other = excluded.juniors_other,
        ambassadors_other = excluded.ambassadors_other,
        notes = excluded.notes,
        dates_missing = excluded.dates_missing,
        email = excluded.email,
        phone = excluded.phone,
        emergency_contact_name = excluded.emergency_contact_name,
        emergency_contact_phone = excluded.emergency_contact_phone,
        gender = excluded.gender,
        dob = excluded.dob,
        home_address = excluded.home_address
  -- xmax is 0 on a freshly inserted row and non-zero on one the conflict updated.
  returning (xmax = 0) into v_is_new;

  return v_is_new;
end $function$
;

-- Parent attachment needs only an exact-email account lookup, not role-list access.
CREATE FUNCTION public.find_parent_account(p_email text)
RETURNS TABLE(id uuid, display_name text, email text, is_parent boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role('director') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'Only Director or Admin can look up a parent account' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.display_name, p.email,
           EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'parent')
    FROM public.profiles p WHERE p.email = lower(trim(p_email));
END;
$function$;
REVOKE ALL ON FUNCTION public.find_parent_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_parent_account(text) TO authenticated;
