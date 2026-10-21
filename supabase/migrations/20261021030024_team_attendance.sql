-- Team attendance: Program manages setup and reads results; coaches mark their
-- assigned teams only. Program assignment is a narrow RPC, not roster edit access.
ALTER TABLE public.attendance_records ADD COLUMN note text NOT NULL DEFAULT '';
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_note_length CHECK (length(note) <= 1000);

DROP POLICY "read days" ON public.attendance_days;
DROP POLICY "staff days" ON public.attendance_days;
CREATE POLICY "read days" ON public.attendance_days FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('program') OR has_role('coach'));
CREATE POLICY "manage days" ON public.attendance_days FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('program')) WITH CHECK (has_role('admin') OR has_role('program'));
CREATE POLICY "program read groups" ON public.attendance_groups FOR SELECT TO authenticated USING (has_role('program'));
CREATE POLICY "program read seasons" ON public.seasons FOR SELECT TO authenticated USING (has_role('program'));
CREATE POLICY "program manage teams" ON public.ministry_teams FOR ALL TO authenticated
  USING (has_role('program')) WITH CHECK (has_role('program'));
CREATE POLICY "program manage team coaches" ON public.team_coaches FOR ALL TO authenticated
  USING (has_role('program')) WITH CHECK (has_role('program'));

CREATE OR REPLACE FUNCTION public.can_mark(p_reg uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role('admin') OR (has_role('coach') AND EXISTS (
    SELECT 1 FROM registrations r JOIN team_coaches tc ON tc.team_id = r.team_id
    WHERE r.id = p_reg AND tc.user_id = auth.uid()
  ));
$$;
DROP POLICY "read records" ON public.attendance_records;
CREATE POLICY "read records" ON public.attendance_records FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('program') OR can_mark(registration_id));

-- Even direct REST updates must respect the lock and cannot move a mark to
-- another kid/day. FOR SHARE serializes a mark against a concurrent lock.
CREATE FUNCTION public.guard_attendance_mark() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.day_id <> OLD.day_id OR NEW.registration_id <> OLD.registration_id OR NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Attendance identity cannot change';
  END IF;
  PERFORM 1 FROM attendance_days WHERE id = OLD.day_id AND NOT locked FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance day is locked'; END IF;
  NEW.marked_by := auth.uid();
  NEW.marked_at := now();
  NEW.method := 'manual';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_attendance_mark() FROM PUBLIC;
CREATE TRIGGER attendance_mark_guard BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_mark();

CREATE FUNCTION public.attendance_coach_options()
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, coalesce(nullif(trim(p.display_name), ''), 'Unnamed coach')
  FROM profiles p WHERE (has_role('admin') OR has_role('program'))
  AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'coach')
  ORDER BY 2, 1;
$$;

CREATE FUNCTION public.assign_attendance_team(p_registrations uuid[], p_team uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT (has_role('admin') OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  IF cardinality(p_registrations) IS NULL OR cardinality(p_registrations) = 0 THEN
    RAISE EXCEPTION 'Select at least one kid';
  END IF;
  -- Lock the selected rows and target team before checking season/division.
  PERFORM 1 FROM registrations WHERE id = ANY(p_registrations) FOR UPDATE;
  PERFORM 1 FROM ministry_teams WHERE id = p_team FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM unnest(p_registrations) ids(id)
    LEFT JOIN registrations r ON r.id = ids.id
    LEFT JOIN seasons s ON s.id = r.season_id
    WHERE r.id IS NULL OR NOT r.active OR NOT coalesce(s.is_current, false)
      OR (p_team IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ministry_teams t WHERE t.id = p_team AND t.active
          AND t.season_id = r.season_id AND t.division = r.division
      ))
  ) THEN RAISE EXCEPTION 'Choose active kids and a team in the same current season and division'; END IF;
  UPDATE registrations SET team_id = p_team WHERE id = ANY(p_registrations);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.populate_attendance_day(p_day uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; n integer;
BEGIN
  IF NOT (has_role('admin') OR has_role('program') OR has_role('coach')) THEN
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
      AND (has_role('admin') OR has_role('program') OR can_mark(r.id))
      AND NOT (r.id = ANY(g.exclude_ids))
      AND (r.id = ANY(g.include_ids) OR (
        (g.session IS NULL OR r.division = g.session)
        AND (g.grade_min IS NULL OR r.grade >= g.grade_min)
        AND (g.grade_max IS NULL OR r.grade <= g.grade_max)))
    ON CONFLICT (day_id, registration_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Session creation and its registration snapshot succeed or fail together.
CREATE FUNCTION public.create_attendance_day(p_season uuid, p_date date, p_label text, p_division text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE group_id uuid; day_id uuid;
BEGIN
  IF NOT (has_role('admin') OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
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
$$;

REVOKE ALL ON FUNCTION public.attendance_coach_options(), public.assign_attendance_team(uuid[], uuid),
  public.create_attendance_day(uuid, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_coach_options(), public.assign_attendance_team(uuid[], uuid),
  public.create_attendance_day(uuid, date, text, text) TO authenticated;

-- Definer summaries must apply the same visibility as the record policy.
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
  where (public.has_role('admin') or public.has_role('program') or public.can_mark(r.id))  -- security definer: gate explicitly
    and r.active
    and r.season_id = (select id from s)
  group by r.id, k.first_name, k.last_name, r.grade, r.division, r.team_id, t.name
  order by 13 desc, k.last_name, k.first_name;
$function$;


-- Team links never grant a role. A removed Coach role immediately stops marking
-- through can_mark(), even if an old team_coaches row remains.
CREATE FUNCTION public.guard_attendance_coach() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.user_id AND role = 'coach') THEN
    RAISE EXCEPTION 'Assign a user with the Coach role';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_attendance_coach() FROM PUBLIC;
CREATE TRIGGER team_coach_role_guard BEFORE INSERT OR UPDATE ON public.team_coaches
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_coach();

CREATE FUNCTION public.guard_attendance_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE record_day uuid; record_registration uuid; season uuid;
BEGIN
  record_day := CASE WHEN TG_OP = 'DELETE' THEN OLD.day_id ELSE NEW.day_id END;
  record_registration := CASE WHEN TG_OP = 'DELETE' THEN OLD.registration_id ELSE NEW.registration_id END;
  SELECT season_id INTO season FROM attendance_days WHERE id = record_day AND NOT locked FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance day is locked or missing'; END IF;
  IF season IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM registrations WHERE id = record_registration AND season_id = season
  ) THEN RAISE EXCEPTION 'Registration must belong to the attendance season'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_attendance_scope() FROM PUBLIC;
CREATE TRIGGER attendance_scope_guard BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_scope();

CREATE FUNCTION public.guard_attendance_day_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.season_id IS DISTINCT FROM OLD.season_id OR NEW.group_id <> OLD.group_id THEN
    RAISE EXCEPTION 'Attendance season and group cannot change';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_attendance_day_identity() FROM PUBLIC;
CREATE TRIGGER attendance_day_identity_guard BEFORE UPDATE ON public.attendance_days
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_day_identity();

DROP POLICY "staff delete records" ON public.attendance_records;
CREATE POLICY "staff delete records" ON public.attendance_records FOR DELETE TO authenticated
  USING (has_role('admin') AND EXISTS (SELECT 1 FROM attendance_days WHERE id = day_id AND NOT locked));

-- Aggregate inside Postgres rather than downloading a season of mark rows
-- (which would exceed PostgREST's row limit). Invoker mode preserves record RLS.
CREATE FUNCTION public.attendance_session_overview(p_season uuid)
RETURNS TABLE(id uuid, date date, title text, locked boolean, total bigint, present bigint, unmarked bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT d.id, d.date, coalesce(d.label, g.name), d.locked, count(r.id),
    count(r.id) FILTER (WHERE r.status IN ('present', 'late')),
    count(r.id) FILTER (WHERE r.status = 'unmarked')
  FROM attendance_days d JOIN attendance_groups g ON g.id = d.group_id
  LEFT JOIN attendance_records r ON r.day_id = d.id
  WHERE d.season_id = p_season
  GROUP BY d.id, g.name ORDER BY d.date DESC, d.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.attendance_session_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_session_overview(uuid) TO authenticated;
