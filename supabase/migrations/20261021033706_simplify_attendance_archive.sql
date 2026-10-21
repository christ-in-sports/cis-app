-- Attendance has its own archive. Archiving never changes seasons, rosters,
-- teams, registrations or marks. Existing days remain active and visible.
ALTER TABLE public.attendance_days ADD COLUMN archived_at timestamptz;
ALTER TABLE public.attendance_days ADD CONSTRAINT archived_attendance_locked
  CHECK (archived_at IS NULL OR locked);

-- Seasons remain an internal registration/sports relationship. An accidentally
-- created empty current season must not hide the existing attendance roster.
CREATE FUNCTION public.attendance_roster_season() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM seasons s
  WHERE has_role('admin') OR has_role('program') OR has_role('coach')
  ORDER BY EXISTS (SELECT 1 FROM registrations r WHERE r.season_id = s.id AND r.active) DESC,
    s.is_current DESC, s.starts_on DESC, s.id
  LIMIT 1;
$$;

CREATE FUNCTION public.create_attendance_date(p_date date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source_season uuid; new_group uuid; new_day uuid;
BEGIN
  IF NOT (has_role('admin') OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Choose an attendance date'; END IF;
  source_season := attendance_roster_season();
  IF source_season IS NULL THEN RAISE EXCEPTION 'Add registrations before creating attendance'; END IF;
  INSERT INTO attendance_groups(name, created_by) VALUES ('Attendance', auth.uid()) RETURNING id INTO new_group;
  INSERT INTO attendance_days(group_id, date, season_id, created_by)
    VALUES (new_group, p_date, source_season, auth.uid()) RETURNING id INTO new_day;
  PERFORM populate_attendance_day(new_day);
  RETURN new_day;
END;
$$;

CREATE FUNCTION public.archive_current_attendance() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT (has_role('admin') OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  UPDATE attendance_days SET archived_at = now(), locked = true WHERE archived_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE FUNCTION public.attendance_days_overview(p_archived boolean DEFAULT false)
RETURNS TABLE(id uuid, date date, title text, locked boolean, total bigint, present bigint, unmarked bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT d.id, d.date, coalesce(d.label, g.name), d.locked, count(r.id),
    count(r.id) FILTER (WHERE r.status IN ('present', 'late')),
    count(r.id) FILTER (WHERE r.status = 'unmarked')
  FROM attendance_days d JOIN attendance_groups g ON g.id = d.group_id
  LEFT JOIN attendance_records r ON r.day_id = d.id
  WHERE (d.archived_at IS NOT NULL) = p_archived
  GROUP BY d.id, g.name ORDER BY d.date DESC, d.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.assign_attendance_team(p_registrations uuid[], p_team uuid)
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
$$;

CREATE FUNCTION public.attendance_archive_summary(p_archived boolean DEFAULT false)
 RETURNS TABLE(registration_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid, team_name text, eligible integer, present integer, late integer, absent integer, excused integer, unmarked integer, attended integer, pct numeric)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  with d as (
    select ad.id from attendance_days ad where (ad.archived_at IS NOT NULL) = p_archived
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
  where (public.has_role('admin') or public.has_role('program') or public.can_mark(r.id))  -- role/team scope also enforced by record RLS
    and ar.id is not null
  group by r.id, k.first_name, k.last_name, r.grade, r.division, r.team_id, t.name
  order by 13 desc, k.last_name, k.first_name;
$function$;



-- Remove direct default grants as well as PUBLIC grants on the new functions.
REVOKE ALL ON FUNCTION public.attendance_roster_season(), public.create_attendance_date(date),
  public.archive_current_attendance(), public.attendance_days_overview(boolean),
  public.attendance_archive_summary(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_roster_season(), public.create_attendance_date(date),
  public.archive_current_attendance(), public.attendance_days_overview(boolean),
  public.attendance_archive_summary(boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
