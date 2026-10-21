-- Hosted Supabase grants EXECUTE directly to API roles by default. Revoking
-- PUBLIC alone does not remove those grants. Attendance RPCs require a signed-in
-- caller; their role checks and record RLS continue to enforce authorization.
REVOKE ALL ON FUNCTION
  public.attendance_coach_options(),
  public.assign_attendance_team(uuid[], uuid),
  public.create_attendance_day(uuid, date, text, text),
  public.attendance_session_overview(uuid),
  public.can_mark(uuid),
  public.attendance_summary(uuid),
  public.populate_attendance_day(uuid),
  public.start_new_season(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.attendance_coach_options(),
  public.assign_attendance_team(uuid[], uuid),
  public.create_attendance_day(uuid, date, text, text),
  public.attendance_session_overview(uuid),
  public.can_mark(uuid),
  public.attendance_summary(uuid),
  public.populate_attendance_day(uuid),
  public.start_new_season(text)
TO authenticated;

-- Trigger execution does not require callers to execute the trigger function
-- directly. These functions are never application API endpoints.
REVOKE ALL ON FUNCTION
  public.guard_attendance_mark(),
  public.guard_attendance_scope(),
  public.guard_attendance_coach(),
  public.guard_attendance_day_identity()
FROM PUBLIC, anon, authenticated;
