-- Baseline of the pre-existing remote schema.
--
-- Context: this project's schema was built by hand in the Supabase dashboard and had
-- no migration history (`supabase migration list` returned nothing). This file captures
-- the schema as it stood on 2026-09-21 so that every later migration has a known
-- starting point, per project_spec.md 2.5 ("Migrations only").
--
-- Provenance: generated from the live database's system catalogs (pg_catalog /
-- pg_indexes / pg_policies / pg_proc / pg_trigger) rather than `supabase db pull`,
-- which requires Docker. Regenerating it with `supabase db pull` once Docker is
-- available is a valid way to double-check this file.
--
-- Scope notes:
--   * Covers the `public` schema, plus the two custom triggers on `auth.users`
--     (`on_auth_user_created`, `on_auth_user_meta_updated`), which live outside
--     `public` and would be missed by a `--schema=public` dump.
--   * Ownership and GRANTs are omitted; Supabase manages default privileges.
--   * No Storage buckets exist yet, so there is nothing to capture for storage.
--
-- Order matters: tables -> constraints -> indexes -> functions -> triggers -> RLS
-- -> policies. Functions are created after tables because SQL-language bodies are
-- validated at creation time, and policies are created after functions because
-- several policies call is_staff() / is_coach() / can_mark().

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attendance_days (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    group_id uuid NOT NULL,
    date date NOT NULL,
    label text,
    notes text,
    locked boolean NOT NULL DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    season_id uuid
);

CREATE TABLE IF NOT EXISTS public.attendance_groups (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    session text,
    grade_min integer,
    grade_max integer,
    include_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    exclude_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    day_id uuid NOT NULL,
    registration_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'unmarked'::text,
    method text NOT NULL DEFAULT 'manual'::text,
    marked_by uuid,
    marked_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.game_days (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tournament_id uuid NOT NULL,
    date date NOT NULL,
    start_time time without time zone DEFAULT '14:00:00'::time without time zone,
    duration_min integer DEFAULT 120,
    courts_available integer DEFAULT 2,
    sport_type text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_scores (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    match_id uuid NOT NULL,
    home_score integer DEFAULT 0,
    away_score integer DEFAULT 0,
    score_details jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.matches (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    sport_id uuid NOT NULL,
    tournament_id uuid NOT NULL,
    home_team_id uuid,
    away_team_id uuid,
    match_type text NOT NULL,
    round integer,
    bracket text,
    court integer,
    scheduled_date date,
    scheduled_time time without time zone,
    estimated_duration_min integer DEFAULT 20,
    status text NOT NULL DEFAULT 'scheduled'::text,
    winner_team_id uuid,
    is_draw boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ministry_teams (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    session text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tournament_id uuid NOT NULL,
    match_id uuid,
    title text NOT NULL,
    body text NOT NULL,
    sent_by uuid,
    sent_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.overall_standings (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tournament_id uuid NOT NULL,
    team_id uuid NOT NULL,
    soccer_points numeric(5,2) DEFAULT 0,
    basketball_points numeric(5,2) DEFAULT 0,
    volleyball_points numeric(5,2) DEFAULT 0,
    dodgeball_points numeric(5,2) DEFAULT 0,
    total_points numeric(7,2) DEFAULT 0,
    "position" integer,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    email text,
    display_name text,
    created_at timestamp with time zone DEFAULT now(),
    is_staff boolean NOT NULL DEFAULT false,
    is_coach boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid,
    tournament_id uuid,
    fcm_token text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.registrations (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    gender text,
    dob date,
    grade text,
    address text,
    youth_phone text,
    youth_email text,
    guardian_name text,
    guardian_phone text,
    guardian_email text,
    emergency_contact_name text,
    emergency_contact_phone text,
    notes text,
    active boolean NOT NULL DEFAULT true,
    source text NOT NULL DEFAULT 'manual'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    session text,
    team_id uuid,
    qr_token text DEFAULT replace(encode(gen_random_bytes(9), 'base64'::text), '/'::text, '_'::text),
    attendance jsonb NOT NULL DEFAULT '{}'::jsonb,
    attendance_archive jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.seasons (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    starts_on date NOT NULL DEFAULT CURRENT_DATE,
    ends_on date,
    is_current boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sports (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tournament_id uuid NOT NULL,
    sport_type text NOT NULL,
    play_mode text NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.standings (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    sport_id uuid NOT NULL,
    team_id uuid NOT NULL,
    played integer DEFAULT 0,
    won integer DEFAULT 0,
    drawn integer DEFAULT 0,
    lost integer DEFAULT 0,
    points integer DEFAULT 0,
    scored integer DEFAULT 0,
    conceded integer DEFAULT 0,
    difference integer DEFAULT 0,
    "position" integer,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_coaches (
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teams (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tournament_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3B82F6'::text,
    seed integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_members (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tournament_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'viewer'::text,
    joined_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournaments (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    description text,
    owner_id uuid NOT NULL,
    share_code text DEFAULT substr(md5((random())::text), 1, 8),
    team_count integer NOT NULL,
    status text NOT NULL DEFAULT 'setup'::text,
    current_sport text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sport_weights jsonb DEFAULT '{"soccer": 25, "dodgeball": 25, "basketball": 25, "volleyball": 25}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Primary keys
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance_days ADD CONSTRAINT attendance_days_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance_groups ADD CONSTRAINT attendance_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);
ALTER TABLE public.game_days ADD CONSTRAINT game_days_pkey PRIMARY KEY (id);
ALTER TABLE public.match_scores ADD CONSTRAINT match_scores_pkey PRIMARY KEY (id);
ALTER TABLE public.matches ADD CONSTRAINT matches_pkey PRIMARY KEY (id);
ALTER TABLE public.ministry_teams ADD CONSTRAINT ministry_teams_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.overall_standings ADD CONSTRAINT overall_standings_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.registrations ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.seasons ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);
ALTER TABLE public.sports ADD CONSTRAINT sports_pkey PRIMARY KEY (id);
ALTER TABLE public.standings ADD CONSTRAINT standings_pkey PRIMARY KEY (id);
ALTER TABLE public.team_coaches ADD CONSTRAINT team_coaches_pkey PRIMARY KEY (team_id, user_id);
ALTER TABLE public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE public.tournament_members ADD CONSTRAINT tournament_members_pkey PRIMARY KEY (id);
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);

-- ---------------------------------------------------------------------------
-- Foreign keys, unique and check constraints
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance_days ADD CONSTRAINT attendance_days_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.attendance_days ADD CONSTRAINT attendance_days_group_id_date_key UNIQUE (group_id, date);
ALTER TABLE public.attendance_days ADD CONSTRAINT attendance_days_group_id_fkey FOREIGN KEY (group_id) REFERENCES attendance_groups(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_days ADD CONSTRAINT attendance_days_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_groups ADD CONSTRAINT attendance_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_method_chk CHECK ((method = ANY (ARRAY['manual'::text, 'qr'::text, 'face'::text, 'voice'::text])));
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_day_id_fkey FOREIGN KEY (day_id) REFERENCES attendance_days(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_day_id_registration_id_key UNIQUE (day_id, registration_id);
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES profiles(id);
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_status_chk CHECK ((status = ANY (ARRAY['unmarked'::text, 'present'::text, 'absent'::text, 'late'::text, 'excused'::text])));
ALTER TABLE public.game_days ADD CONSTRAINT game_days_sport_type_check CHECK ((sport_type = ANY (ARRAY['soccer'::text, 'basketball'::text, 'volleyball'::text, 'dodgeball'::text])));
ALTER TABLE public.game_days ADD CONSTRAINT game_days_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.match_scores ADD CONSTRAINT match_scores_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
ALTER TABLE public.match_scores ADD CONSTRAINT match_scores_match_id_key UNIQUE (match_id);
ALTER TABLE public.matches ADD CONSTRAINT matches_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD CONSTRAINT matches_bracket_check CHECK ((bracket = ANY (ARRAY['top'::text, 'bottom'::text, 'main'::text, NULL::text])));
ALTER TABLE public.matches ADD CONSTRAINT matches_court_check CHECK ((court = ANY (ARRAY[1, 2, NULL::integer])));
ALTER TABLE public.matches ADD CONSTRAINT matches_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD CONSTRAINT matches_match_type_check CHECK ((match_type = ANY (ARRAY['league'::text, 'knockout'::text, 'third_place'::text, 'fifth_place'::text, 'spiritual'::text])));
ALTER TABLE public.matches ADD CONSTRAINT matches_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.matches ADD CONSTRAINT matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.matches ADD CONSTRAINT matches_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.ministry_teams ADD CONSTRAINT ministry_teams_session_chk CHECK (((session IS NULL) OR (session = ANY (ARRAY['juniors'::text, 'ambassadors'::text]))));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.overall_standings ADD CONSTRAINT overall_standings_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.overall_standings ADD CONSTRAINT overall_standings_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.overall_standings ADD CONSTRAINT overall_standings_tournament_id_team_id_key UNIQUE (tournament_id, team_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_tournament_id_fcm_token_key UNIQUE (user_id, tournament_id, fcm_token);
ALTER TABLE public.registrations ADD CONSTRAINT registrations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.registrations ADD CONSTRAINT registrations_session_chk CHECK (((session IS NULL) OR (session = ANY (ARRAY['juniors'::text, 'ambassadors'::text]))));
ALTER TABLE public.registrations ADD CONSTRAINT registrations_team_fk FOREIGN KEY (team_id) REFERENCES ministry_teams(id) ON DELETE SET NULL;
ALTER TABLE public.seasons ADD CONSTRAINT seasons_name_key UNIQUE (name);
ALTER TABLE public.sports ADD CONSTRAINT sports_play_mode_check CHECK ((play_mode = ANY (ARRAY['league'::text, 'tournament'::text, 'league_tournament'::text])));
ALTER TABLE public.sports ADD CONSTRAINT sports_sport_type_check CHECK ((sport_type = ANY (ARRAY['soccer'::text, 'basketball'::text, 'volleyball'::text, 'dodgeball'::text])));
ALTER TABLE public.sports ADD CONSTRAINT sports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'league_phase'::text, 'tournament_phase'::text, 'completed'::text])));
ALTER TABLE public.sports ADD CONSTRAINT sports_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.sports ADD CONSTRAINT sports_tournament_id_sport_type_key UNIQUE (tournament_id, sport_type);
ALTER TABLE public.standings ADD CONSTRAINT standings_sport_id_fkey FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE;
ALTER TABLE public.standings ADD CONSTRAINT standings_sport_id_team_id_key UNIQUE (sport_id, team_id);
ALTER TABLE public.standings ADD CONSTRAINT standings_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_coaches ADD CONSTRAINT team_coaches_team_id_fkey FOREIGN KEY (team_id) REFERENCES ministry_teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_coaches ADD CONSTRAINT team_coaches_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD CONSTRAINT teams_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.tournament_members ADD CONSTRAINT tournament_members_profile_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tournament_members ADD CONSTRAINT tournament_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'viewer'::text])));
ALTER TABLE public.tournament_members ADD CONSTRAINT tournament_members_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.tournament_members ADD CONSTRAINT tournament_members_tournament_id_user_id_key UNIQUE (tournament_id, user_id);
ALTER TABLE public.tournament_members ADD CONSTRAINT tournament_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_current_sport_check CHECK ((current_sport = ANY (ARRAY['soccer'::text, 'basketball'::text, 'volleyball'::text, 'dodgeball'::text])));
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_share_code_key UNIQUE (share_code);
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_status_check CHECK ((status = ANY (ARRAY['setup'::text, 'active'::text, 'completed'::text, 'archived'::text])));
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_team_count_check CHECK (((team_count >= 2) AND (team_count <= 8)));

-- ---------------------------------------------------------------------------
-- Indexes (those not already created by a constraint)
-- ---------------------------------------------------------------------------

CREATE INDEX attendance_days_date_idx ON public.attendance_days USING btree (date DESC);
CREATE INDEX attendance_days_season_idx ON public.attendance_days USING btree (season_id);
CREATE INDEX attendance_records_day_idx ON public.attendance_records USING btree (day_id);
CREATE INDEX attendance_records_reg_idx ON public.attendance_records USING btree (registration_id);
CREATE INDEX idx_matches_sport ON public.matches USING btree (sport_id);
CREATE INDEX idx_matches_status ON public.matches USING btree (status);
CREATE INDEX idx_matches_tournament ON public.matches USING btree (tournament_id);
CREATE INDEX registrations_grade_idx ON public.registrations USING btree (grade);
CREATE UNIQUE INDEX registrations_identity_key ON public.registrations USING btree (lower(TRIM(BOTH FROM first_name)), lower(TRIM(BOTH FROM last_name)), COALESCE(dob, '1900-01-01'::date));
CREATE INDEX registrations_last_name_idx ON public.registrations USING btree (lower(last_name));
CREATE UNIQUE INDEX registrations_qr_token_key ON public.registrations USING btree (qr_token);
CREATE INDEX registrations_session_idx ON public.registrations USING btree (session);
CREATE INDEX registrations_team_idx ON public.registrations USING btree (team_id);
CREATE UNIQUE INDEX seasons_one_current ON public.seasons USING btree (is_current) WHERE is_current;
CREATE INDEX idx_standings_sport ON public.standings USING btree (sport_id);
CREATE INDEX team_coaches_user_idx ON public.team_coaches USING btree (user_id);
CREATE INDEX idx_teams_tournament ON public.teams USING btree (tournament_id);
CREATE INDEX idx_tournament_members_tournament ON public.tournament_members USING btree (tournament_id);
CREATE INDEX idx_tournament_members_user ON public.tournament_members USING btree (user_id);
CREATE INDEX idx_tournaments_share_code ON public.tournaments USING btree (share_code);

-- ---------------------------------------------------------------------------
-- Functions
--
-- Ordered so that each function's dependencies already exist: SQL-language
-- bodies are validated at CREATE time (grade_num -> default_session ->
-- parse_session_choice, and is_staff -> can_mark -> attendance_summary).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.grade_num(g text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when g is null then null
    when lower(trim(g)) in ('k','tk','kinder','kindergarten') then 0
    else nullif(regexp_replace(g, '\D', '', 'g'), '')::int
  end;
$function$;

CREATE OR REPLACE FUNCTION public.default_session(g text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when public.grade_num(g) between 4 and 6  then 'juniors'
    when public.grade_num(g) between 8 and 12 then 'ambassadors'
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION public.parse_session_choice(p_choice text, p_grade text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_choice ilike '%ambassador%' then 'ambassadors'
    when p_choice ilike '%junior%'     then 'juniors'
    else public.default_session(p_grade)
  end;
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select is_staff from profiles where id = auth.uid()),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_coach()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_coach or is_staff from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.can_mark(p_reg uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_staff() or exists (
    select 1
      from registrations r
      join team_coaches tc on tc.team_id = r.team_id
     where r.id = p_reg
       and tc.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.attendance_summary(p_season uuid DEFAULT NULL::uuid)
 RETURNS TABLE(registration_id uuid, first_name text, last_name text, grade text, session text, team_id uuid, team_name text, eligible integer, present integer, late integer, absent integer, excused integer, unmarked integer, attended integer, pct numeric)
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
    r.id, r.first_name, r.last_name, r.grade, r.session, r.team_id, t.name,
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
  left join ministry_teams t on t.id = r.team_id
  left join attendance_records ar
         on ar.registration_id = r.id
        and ar.day_id in (select id from d)
  where public.is_coach()          -- security definer: gate explicitly
    and r.active
  group by r.id, r.first_name, r.last_name, r.grade, r.session, r.team_id, t.name
  order by 13 desc, r.last_name, r.first_name;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_tournament_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT tournament_id FROM tournament_members WHERE user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'signup_role', 'none');

  insert into public.profiles (id, email, display_name, is_staff, is_coach)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), ''),
    v_role = 'staff',
    v_role = 'coach'
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = coalesce(excluded.display_name, profiles.display_name);

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_profile_from_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles
     set display_name = nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
         email        = new.email
   where id = new.id;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.set_day_season()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.season_id is null then
    select id into new.season_id from seasons where is_current limit 1;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_attendance_json()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; d date; cur boolean;
begin
  rid := coalesce(new.registration_id, old.registration_id);

  select ad.date, s.is_current
    into d, cur
    from attendance_days ad
    join seasons s on s.id = ad.season_id
   where ad.id = coalesce(new.day_id, old.day_id);

  if d is null or not coalesce(cur, false) then
    return null;                      -- past season: records still update, mirror doesn't
  end if;

  if tg_op = 'DELETE' or new.status = 'unmarked' then
    update registrations set attendance = attendance - d::text where id = rid;
  else
    update registrations
       set attendance = jsonb_set(attendance, array[d::text], to_jsonb(new.status), true)
     where id = rid;
  end if;

  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.populate_attendance_day(p_day uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g record; n int;
begin
  select d.id as day_id, ag.session, ag.grade_min, ag.grade_max,
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
     and not (r.id = any(g.exclude_ids))
     and (
           r.id = any(g.include_ids)
        or (
             (g.session   is null or r.session = g.session)
         and (g.grade_min is null or public.grade_num(r.grade) >= g.grade_min)
         and (g.grade_max is null or public.grade_num(r.grade) <= g.grade_max)
           )
     )
  on conflict (day_id, registration_id) do nothing;

  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.start_new_season(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old_id uuid; old_name text; new_id uuid;
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

  select id, name into old_id, old_name from seasons where is_current limit 1;

  if old_id is not null then
    -- Park this year's jsonb under the old season name, then clear it
    update registrations
       set attendance_archive =
             jsonb_set(attendance_archive, array[old_name], attendance, true),
           attendance = '{}'::jsonb
     where attendance <> '{}'::jsonb;

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

CREATE OR REPLACE FUNCTION public.check_in_by_token(p_day uuid, p_token text, p_method text DEFAULT 'qr'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  select id, first_name, last_name into r
    from registrations where qr_token = p_token and active;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Unknown code');
  end if;

  insert into attendance_records (day_id, registration_id, status, method, marked_by, marked_at)
  values (p_day, r.id, 'present', p_method, auth.uid(), now())
  on conflict (day_id, registration_id)
  do update set status = 'present', method = p_method,
                marked_by = auth.uid(), marked_at = now();

  return jsonb_build_object('ok', true, 'name', r.first_name || ' ' || r.last_name);
end $function$;

-- ---------------------------------------------------------------------------
-- Triggers
--
-- The two on auth.users are custom additions to a Supabase-managed table; they
-- sit outside the `public` schema and so are not produced by a public-only dump.
-- ---------------------------------------------------------------------------

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER on_auth_user_meta_updated
  AFTER UPDATE OF raw_user_meta_data, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_profile_from_meta();

CREATE TRIGGER attendance_days_season
  BEFORE INSERT ON public.attendance_days
  FOR EACH ROW EXECUTE FUNCTION set_day_season();

CREATE TRIGGER attendance_records_sync
  AFTER INSERT OR DELETE OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION sync_attendance_json();

CREATE TRIGGER registrations_touch
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministry_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overall_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

CREATE POLICY "read days" ON public.attendance_days AS PERMISSIVE FOR SELECT TO authenticated USING (is_coach());
CREATE POLICY "staff days" ON public.attendance_days AS PERMISSIVE FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "read groups" ON public.attendance_groups AS PERMISSIVE FOR SELECT TO authenticated USING (is_coach());
CREATE POLICY "staff groups" ON public.attendance_groups AS PERMISSIVE FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "mark records" ON public.attendance_records AS PERMISSIVE FOR UPDATE TO authenticated USING (can_mark(registration_id)) WITH CHECK (can_mark(registration_id));
CREATE POLICY "read records" ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated USING (is_coach());
CREATE POLICY "staff delete records" ON public.attendance_records AS PERMISSIVE FOR DELETE TO authenticated USING (is_staff());
CREATE POLICY "staff insert records" ON public.attendance_records AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff());

CREATE POLICY "Admins manage game_days" ON public.game_days AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM tournament_members
  WHERE ((tournament_members.tournament_id = game_days.tournament_id) AND (tournament_members.user_id = auth.uid()) AND (tournament_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read game_days" ON public.game_days AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage match_scores" ON public.match_scores AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (tournament_members tm
     JOIN matches m ON ((m.tournament_id = tm.tournament_id)))
  WHERE ((m.id = match_scores.match_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read match_scores" ON public.match_scores AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage matches" ON public.matches AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM tournament_members
  WHERE ((tournament_members.tournament_id = matches.tournament_id) AND (tournament_members.user_id = auth.uid()) AND (tournament_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read matches" ON public.matches AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "read teams" ON public.ministry_teams AS PERMISSIVE FOR SELECT TO authenticated USING (is_coach());
CREATE POLICY "staff teams" ON public.ministry_teams AS PERMISSIVE FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY "Admins manage notifications" ON public.notifications AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM tournament_members
  WHERE ((tournament_members.tournament_id = notifications.tournament_id) AND (tournament_members.user_id = auth.uid()) AND (tournament_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage overall_standings" ON public.overall_standings AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM tournament_members
  WHERE ((tournament_members.tournament_id = overall_standings.tournament_id) AND (tournament_members.user_id = auth.uid()) AND (tournament_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read overall_standings" ON public.overall_standings AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Profiles viewable by everyone" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));

CREATE POLICY "Users manage own subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY "staff delete registrations" ON public.registrations AS PERMISSIVE FOR DELETE TO authenticated USING (is_staff());
CREATE POLICY "staff insert registrations" ON public.registrations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff());
CREATE POLICY "staff or coach read registrations" ON public.registrations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_staff() OR is_coach()));
CREATE POLICY "staff update registrations" ON public.registrations AS PERMISSIVE FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY "read seasons" ON public.seasons AS PERMISSIVE FOR SELECT TO authenticated USING (is_coach());
CREATE POLICY "staff seasons" ON public.seasons AS PERMISSIVE FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY "Admins manage sports" ON public.sports AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM tournament_members
  WHERE ((tournament_members.tournament_id = sports.tournament_id) AND (tournament_members.user_id = auth.uid()) AND (tournament_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read sports" ON public.sports AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage standings" ON public.standings AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (tournament_members tm
     JOIN sports s ON ((s.tournament_id = tm.tournament_id)))
  WHERE ((s.id = standings.sport_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read standings" ON public.standings AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "read team coaches" ON public.team_coaches AS PERMISSIVE FOR SELECT TO authenticated USING (is_coach());
CREATE POLICY "staff team coaches" ON public.team_coaches AS PERMISSIVE FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE POLICY "Admins manage teams" ON public.teams AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM tournament_members
  WHERE ((tournament_members.tournament_id = teams.tournament_id) AND (tournament_members.user_id = auth.uid()) AND (tournament_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read teams" ON public.teams AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Admins can delete members" ON public.tournament_members AS PERMISSIVE FOR DELETE TO public USING ((tournament_id IN ( SELECT get_my_tournament_ids() AS get_my_tournament_ids)));
CREATE POLICY "Admins can update members" ON public.tournament_members AS PERMISSIVE FOR UPDATE TO public USING ((tournament_id IN ( SELECT get_my_tournament_ids() AS get_my_tournament_ids)));
CREATE POLICY "Admins delete members" ON public.tournament_members AS PERMISSIVE FOR DELETE TO public USING (((EXISTS ( SELECT 1
   FROM tournament_members tm2
  WHERE ((tm2.tournament_id = tournament_members.tournament_id) AND (tm2.user_id = auth.uid()) AND (tm2.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) OR (auth.uid() = user_id)));
CREATE POLICY "Admins manage members" ON public.tournament_members AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tournament_members tm2
  WHERE ((tm2.tournament_id = tournament_members.tournament_id) AND (tm2.user_id = auth.uid()) AND (tm2.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Public read tournament_members" ON public.tournament_members AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can join tournaments" ON public.tournament_members AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "allow select for authenticated" ON public.tournament_members AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Admins manage tournaments" ON public.tournaments AS PERMISSIVE FOR ALL TO public USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM tournament_members
  WHERE ((tournament_members.tournament_id = tournaments.id) AND (tournament_members.user_id = auth.uid()) AND (tournament_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));
CREATE POLICY "Anyone can view tournaments" ON public.tournaments AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can view tournaments by share_code" ON public.tournaments AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Anyone creates tournaments" ON public.tournaments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "Public read tournaments" ON public.tournaments AS PERMISSIVE FOR SELECT TO public USING (true);
