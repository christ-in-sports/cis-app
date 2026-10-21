-- A rollover retires teams without deleting sports references or old attendance.
ALTER TABLE public.ministry_teams ADD COLUMN archived_at timestamptz;
ALTER TABLE public.ministry_teams ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.ministry_teams ADD CONSTRAINT retired_teams_inactive
  CHECK ((archived_at IS NULL AND deleted_at IS NULL) OR NOT active);
ALTER TABLE public.ministry_teams DROP CONSTRAINT ministry_teams_season_division_name_key;
CREATE UNIQUE INDEX ministry_teams_active_name_key
  ON public.ministry_teams(season_id, division, name) WHERE active;

ALTER TABLE public.attendance_days ADD COLUMN roster_frozen boolean NOT NULL DEFAULT false;
CREATE TABLE public.attendance_team_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A null day stores the retired team's roster, even if it had no attendance
  -- days or a manager later deletes its days. Non-null days freeze day rosters.
  day_id uuid REFERENCES public.attendance_days(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.ministry_teams(id) ON DELETE RESTRICT,
  UNIQUE(day_id, registration_id),
  CHECK (day_id IS NOT NULL OR team_id IS NOT NULL)
);
CREATE UNIQUE INDEX attendance_team_snapshots_membership_key
  ON public.attendance_team_snapshots(team_id, registration_id) WHERE day_id IS NULL;
CREATE INDEX attendance_team_snapshots_registration_idx ON public.attendance_team_snapshots(registration_id);
CREATE INDEX attendance_team_snapshots_team_idx ON public.attendance_team_snapshots(team_id);
ALTER TABLE public.attendance_team_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_team_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.attendance_team_snapshots TO authenticated;
CREATE POLICY "read own attendance team snapshots" ON public.attendance_team_snapshots
  FOR SELECT TO authenticated USING (
    has_role('admin') OR has_role('program') OR (has_role('coach') AND EXISTS (
      SELECT 1 FROM team_coaches tc WHERE tc.team_id = attendance_team_snapshots.team_id AND tc.user_id = auth.uid()
    ))
  );

-- Preserve any days already archived before this migration, without retiring
-- teams or changing assignments until a manager presses Archive.
INSERT INTO public.attendance_team_snapshots(day_id, registration_id, team_id)
  SELECT ar.day_id, ar.registration_id, r.team_id
  FROM public.attendance_records ar JOIN public.registrations r ON r.id = ar.registration_id
  JOIN public.attendance_days d ON d.id = ar.day_id WHERE d.archived_at IS NOT NULL;
UPDATE public.attendance_days SET roster_frozen = true WHERE archived_at IS NOT NULL;

-- Narrow definer lookup avoids recursive record RLS and never grants access to
-- a kid's broader registration/contact information through an archived team.
CREATE FUNCTION public.can_access_attendance_record(p_day uuid, p_registration uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role('admin') OR (has_role('coach') AND EXISTS (
    SELECT 1 FROM attendance_days d CROSS JOIN registrations r
    LEFT JOIN attendance_team_snapshots s ON s.day_id = p_day AND s.registration_id = r.id
    JOIN team_coaches tc ON tc.team_id = CASE WHEN d.roster_frozen THEN s.team_id ELSE r.team_id END
    WHERE d.id = p_day AND r.id = p_registration AND tc.user_id = auth.uid()
  ));
$$;
DROP POLICY "read records" ON public.attendance_records;
CREATE POLICY "read records" ON public.attendance_records FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('program') OR can_access_attendance_record(day_id, registration_id));
DROP POLICY "mark records" ON public.attendance_records;
CREATE POLICY "mark records" ON public.attendance_records FOR UPDATE TO authenticated
  USING (can_access_attendance_record(day_id, registration_id))
  WITH CHECK (can_access_attendance_record(day_id, registration_id));

CREATE FUNCTION public.guard_frozen_attendance_roster() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM attendance_days WHERE id = NEW.day_id AND roster_frozen) THEN
    RAISE EXCEPTION 'Archived rosters cannot add new registrations';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER frozen_attendance_roster_guard BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_attendance_roster();

CREATE OR REPLACE FUNCTION public.archive_current_attendance() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT (has_role('admin') OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
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
$$;

CREATE FUNCTION public.delete_attendance_team(p_team uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role('admin') OR has_role('program')) THEN RAISE EXCEPTION 'Admin or Program only'; END IF;
  LOCK TABLE registrations, ministry_teams IN SHARE ROW EXCLUSIVE MODE;
  UPDATE ministry_teams SET deleted_at = now(), active = false
    WHERE id = p_team AND active AND archived_at IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a current team'; END IF;
  UPDATE registrations SET team_id = NULL WHERE team_id = p_team;
  DELETE FROM team_coaches WHERE team_id = p_team;
END;
$$;

CREATE FUNCTION public.attendance_day_roster(p_day uuid)
RETURNS TABLE(id uuid, day_id uuid, registration_id uuid, status text, method text, marked_at timestamptz,
  note text, kid_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ar.id, ar.day_id, ar.registration_id, ar.status, ar.method, ar.marked_at, ar.note,
    r.kid_id, k.first_name, k.last_name, r.grade, r.division,
    CASE WHEN d.roster_frozen THEN s.team_id ELSE r.team_id END
  FROM attendance_records ar JOIN attendance_days d ON d.id = ar.day_id
  JOIN registrations r ON r.id = ar.registration_id JOIN kids k ON k.id = r.kid_id
  LEFT JOIN attendance_team_snapshots s ON s.day_id = ar.day_id AND s.registration_id = ar.registration_id
  WHERE ar.day_id = p_day AND (has_role('admin') OR has_role('program') OR can_access_attendance_record(ar.day_id, ar.registration_id));
$$;

CREATE OR REPLACE FUNCTION public.attendance_archive_summary(p_archived boolean DEFAULT false)
RETURNS TABLE(registration_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid,
  team_name text, eligible integer, present integer, late integer, absent integer, excused integer,
  unmarked integer, attended integer, pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH visible AS (
    SELECT ar.*, d.date, d.created_at,
      CASE WHEN d.roster_frozen THEN s.team_id ELSE r.team_id END AS roster_team
    FROM attendance_records ar JOIN attendance_days d ON d.id = ar.day_id
    JOIN registrations r ON r.id = ar.registration_id
    LEFT JOIN attendance_team_snapshots s ON s.day_id = ar.day_id AND s.registration_id = ar.registration_id
    WHERE (d.archived_at IS NOT NULL) = p_archived
      AND (has_role('admin') OR has_role('program') OR can_access_attendance_record(ar.day_id, ar.registration_id))
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
$$;

CREATE FUNCTION public.archived_attendance_team_roster()
RETURNS TABLE(id uuid, kid_id uuid, first_name text, last_name text, grade integer, division text, team_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT r.id, r.kid_id, k.first_name, k.last_name, r.grade, r.division, s.team_id
  FROM attendance_team_snapshots s JOIN ministry_teams t ON t.id = s.team_id
  JOIN registrations r ON r.id = s.registration_id JOIN kids k ON k.id = r.kid_id
  WHERE s.day_id IS NULL AND t.archived_at IS NOT NULL AND (has_role('admin') OR has_role('program'));
$$;

REVOKE ALL ON FUNCTION public.archived_attendance_team_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archived_attendance_team_roster() TO authenticated;
REVOKE ALL ON FUNCTION public.can_access_attendance_record(uuid,uuid), public.delete_attendance_team(uuid),
  public.attendance_day_roster(uuid), public.archive_current_attendance(), public.attendance_archive_summary(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_attendance_record(uuid,uuid), public.delete_attendance_team(uuid),
  public.attendance_day_roster(uuid), public.archive_current_attendance(), public.attendance_archive_summary(boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_frozen_attendance_roster() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
