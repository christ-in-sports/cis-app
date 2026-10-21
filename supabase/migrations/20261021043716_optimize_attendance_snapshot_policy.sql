-- Cache identity/role lookups once per statement instead of per snapshot row.
ALTER POLICY "read own attendance team snapshots" ON public.attendance_team_snapshots
  USING (
    (SELECT public.has_role('admin')) OR (SELECT public.has_role('program')) OR
    ((SELECT public.has_role('coach')) AND EXISTS (
      SELECT 1 FROM public.team_coaches tc
      WHERE tc.team_id = attendance_team_snapshots.team_id AND tc.user_id = (SELECT auth.uid())
    ))
  );
NOTIFY pgrst, 'reload schema';
