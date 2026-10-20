-- Servant registration (ENG-18, part of ENG-17).
--
-- Each season a servant says whether they are serving, which sessions and
-- sub-teams they prefer, and gives contact and emergency details. It replaces
-- the "CIS Servants Commitment" Google Form.
--
-- What this adds:
--   * servant_registrations   one row per (user, season)
--   * RLS                     a servant reads their own row, an Admin reads all
--   * submit_servant_registration()   the only way to write a row
--   * "authenticated reads current season"   so a roleless servant can see the
--                                            season name on the form
--
-- Why a function rather than INSERT/UPDATE policies: same reasons as
-- register_kid() (20260928120000_parent_registration.sql). user_id, season_id,
-- email and the timestamps must come from the database, not from whatever the
-- caller sends to PostgREST, and a policy cannot stop a servant moving their
-- row to another user or season. The caller never gets a write path to the table.
--
-- Sub-teams are a preference an Admin reads when assigning roles. Nothing here
-- grants a role.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.servant_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,

  full_name text NOT NULL,
  evaluation_status text NOT NULL,
  is_serving boolean NOT NULL,

  sessions text[] NOT NULL DEFAULT '{}',
  juniors_subteams text[] NOT NULL DEFAULT '{}',
  ambassadors_subteams text[] NOT NULL DEFAULT '{}',
  juniors_other text,
  ambassadors_other text,

  notes text,
  dates_missing text,

  email text NOT NULL,
  phone text NOT NULL,
  emergency_contact_name text NOT NULL,
  emergency_contact_phone text NOT NULL,
  gender text NOT NULL,
  dob date NOT NULL,
  home_address text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT servant_registrations_user_season_key UNIQUE (user_id, season_id),

  CONSTRAINT servant_registrations_evaluation_values
    CHECK (evaluation_status IN ('completed', 'not_completed')),
  CONSTRAINT servant_registrations_gender_values
    CHECK (gender IN ('female', 'male')),
  CONSTRAINT servant_registrations_sessions_values
    CHECK (sessions <@ ARRAY['juniors', 'ambassadors']),
  CONSTRAINT servant_registrations_juniors_subteams_values
    CHECK (juniors_subteams <@ ARRAY['admin', 'coaches', 'fellowship', 'prayer', 'program']),
  CONSTRAINT servant_registrations_ambassadors_subteams_values
    CHECK (ambassadors_subteams <@ ARRAY['admin', 'coaches', 'fellowship', 'prayer', 'program']),

  -- Not serving means no session answers are kept. Serving means at least one
  -- session, and each chosen session needs a sub-team or an "Other". An
  -- unchosen session carries no answers.
  CONSTRAINT servant_registrations_serving_shape CHECK (
    CASE WHEN is_serving THEN
      cardinality(sessions) > 0
      AND (
        NOT ('juniors' = ANY (sessions))
        OR cardinality(juniors_subteams) > 0
        OR juniors_other IS NOT NULL
      )
      AND (
        NOT ('ambassadors' = ANY (sessions))
        OR cardinality(ambassadors_subteams) > 0
        OR ambassadors_other IS NOT NULL
      )
      AND (
        'juniors' = ANY (sessions)
        OR (cardinality(juniors_subteams) = 0 AND juniors_other IS NULL)
      )
      AND (
        'ambassadors' = ANY (sessions)
        OR (cardinality(ambassadors_subteams) = 0 AND ambassadors_other IS NULL)
      )
    ELSE
      cardinality(sessions) = 0
      AND cardinality(juniors_subteams) = 0
      AND cardinality(ambassadors_subteams) = 0
      AND juniors_other IS NULL
      AND ambassadors_other IS NULL
    END
  )
);

CREATE TRIGGER servant_registrations_touch_updated_at
  BEFORE UPDATE ON public.servant_registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: own row, or Admin. No write policies; writes go through the function.
--
-- DOB, home address and emergency contacts are sensitive, so Program, Coach,
-- Prayer and Parent get nothing. Privileges are also narrowed to SELECT, so a
-- missing policy is not the only thing standing between a caller and a write.
-- ---------------------------------------------------------------------------

ALTER TABLE public.servant_registrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.servant_registrations FROM anon, authenticated;
GRANT SELECT ON public.servant_registrations TO authenticated;

CREATE POLICY "read own servant registration or admin" ON public.servant_registrations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Any signed-in user may read the current season
--
-- A new servant has no role, and the form has to say which season it is for.
-- The season name and dates are not sensitive. This replaces the Parent-only
-- policy from the parent registration migration, which it fully covers.
-- ---------------------------------------------------------------------------

DROP POLICY "parents read current season" ON public.seasons;

CREATE POLICY "authenticated reads current season" ON public.seasons
  FOR SELECT TO authenticated
  USING (is_current);

-- ---------------------------------------------------------------------------
-- submit_servant_registration
--
--   p  jsonb with: full_name, evaluation_status, is_serving, sessions,
--      juniors_subteams, ambassadors_subteams, juniors_other,
--      ambassadors_other, notes, dates_missing, phone, emergency_contact_name,
--      emergency_contact_phone, gender, dob, home_address.
--
-- user_id is auth.uid(), season_id is the current season, and email is the
-- login email from auth.users; none of them can be supplied. Any role may call
-- it, because a servant has none yet.
--
-- Returns true when this created the registration and false when it edited an
-- existing one, so the app can send the confirmation email on first submission
-- only.
--
-- When is_serving is false the session answers are discarded rather than kept
-- from an earlier "yes".
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

REVOKE ALL ON FUNCTION public.submit_servant_registration(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_servant_registration(jsonb) TO authenticated;
