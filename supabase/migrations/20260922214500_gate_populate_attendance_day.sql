-- Require coach or staff to populate an attendance day.
--
-- Context: `populate_attendance_day` is SECURITY DEFINER, so it bypasses RLS, and
-- PostgREST exposes every public function at /rest/v1/rpc/<name>. It had no
-- authorization check of its own, which meant an unauthenticated caller could
-- invoke it and write `attendance_records` rows. Verified by probing it as the
-- `anon` role, which successfully inserted rows.
--
-- This predates the kid/registration split -- the original function had no gate
-- either -- but it was surfaced while reviewing that migration's Supabase
-- security advisories, and the function had just been rewritten, so it is fixed
-- here rather than left open.
--
-- `is_coach()` is the right gate, not `is_staff()`: the two callers are the
-- attendance day creation flow (staff) and a coach populating their own roster
-- (src/app/attendance/attendance-client.tsx and
-- src/app/attendance/[id]/take-client.tsx), and `is_coach()` is already defined
-- as "admin or coach".
--
-- The sibling functions were checked at the same time: `start_new_season`
-- already raises 'Staff only', and `attendance_summary` already filters on
-- `is_coach()`. `check_in_by_token` is ungated too, but it is currently broken
-- (it reads the dropped `qr_token` column) and is deferred to the ticket that
-- decides where the QR token should live -- that ticket must add a gate.

CREATE OR REPLACE FUNCTION public.populate_attendance_day(p_day uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g record; n int;
begin
  -- SECURITY DEFINER bypasses RLS, so the check has to be explicit here.
  if not public.is_coach() then
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
