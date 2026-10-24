-- Servant registration is for servants (ENG-26).
--
-- Parents and Kids are not servants, so an account whose only roles are Parent
-- and/or Kid must not submit or read a servant registration. Until now any
-- signed-in user could: the function said "any role may call it, because a
-- servant has none yet", which was right for a roleless servant but also let a
-- Parent in.
--
-- Who may use it, named role by role (AGENTS.md section 4, no group helper):
--   * someone with no role yet (a new servant waiting for an Admin), or
--   * someone holding Admin, Program Team, Coach or Prayer Team.
-- A Coach who is also a Parent holds a servant role, so keeps access.
--
-- The same test is written out in the function and in the read policy rather
-- than hidden behind a helper such as is_servant(); `project_spec.md` 1.5 is
-- the source and the roles are visible where they are checked.

-- ---------------------------------------------------------------------------
-- Read: own row, or Admin -- and only while still entitled to the form
-- ---------------------------------------------------------------------------

DROP POLICY "read own servant registration or admin" ON public.servant_registrations;

CREATE POLICY "read own servant registration or admin" ON public.servant_registrations
  FOR SELECT TO authenticated
  USING (
    public.has_role('admin')
    OR (
      user_id = auth.uid()
      AND (
        NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
        OR public.has_role('program')
        OR public.has_role('coach')
        OR public.has_role('prayer')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Write: submit_servant_registration()
--
-- Same body as 20261021120000_servant_registrations.sql with one added gate.
-- The error is 42501 (insufficient privilege), like the sign-in check above it.
-- ---------------------------------------------------------------------------

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
       public.has_role('admin')
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
end $function$;

-- CREATE OR REPLACE keeps the existing grants; stated again so this file is
-- complete on its own.
REVOKE ALL ON FUNCTION public.submit_servant_registration(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_servant_registration(jsonb) TO authenticated;
