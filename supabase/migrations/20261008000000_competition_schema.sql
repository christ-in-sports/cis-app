-- Sports competition schema (ENG-12, part of ENG-10).
--
-- Replaces the dropped prototype tournament module (20261007230000) with a
-- season-scoped model:
--
--   Season -> sport block (one sport, one division, 3-4 weeks) -> games -> result
--
-- Decisions this encodes (ENG-10, 2026-10-07):
--   * Teams last the whole season. A team is a `ministry_teams` row, which now
--     belongs to a season and has exactly one division. There is no per-sport
--     team, so project_spec.md's `Team.sport` is dropped.
--   * Standings are NOT stored. They are computed from results (the logic lives
--     in src/lib/competition/standings.ts, ENG-13), so they cannot drift from
--     the scores. Only each team's final place in a finished block is stored,
--     in `sport_block_places`, because the Director's season-long weighting will
--     be built on it.
--   * League draws are allowed (3 / 1 / 0). A knockout or placement game needs a
--     winner, so a level score must name a tiebreak winner.
--   * Knockout progression is an explicit graph: every game says which game and
--     slot its winner and its loser go to, or which final place they take. The
--     prototype guessed the next game from round and bracket name, which sent
--     the 5th-place winner into the Final.
--   * No score verification step. A saved result is final.
--
-- Permissions (project_spec.md 1.5): every role views sports standings; only
-- Admin and Program Team update them. Team management stays Admin-only -- the
-- matrix gives Program Team no roster or team write -- so `ministry_teams` keeps
-- its Admin-only writes and only widens READ, because every role needs a team's
-- name to read a standings table.
--
-- Why games / game_results / sport_block_places have no write policy: the same
-- reason as `payments` (20261005120000). A result advances teams into later
-- games and stamps who recorded it, and none of that may be whatever the caller
-- sent to PostgREST. Every write goes through a SECURITY DEFINER function below,
-- which locks the rows, validates the graph and stamps recorded_by / recorded_at
-- from auth.uid() and now().
--
-- sport_blocks is the exception: Admin / Program Team write it directly (name,
-- dates, format, settings), but `status` is not writable by anyone -- column
-- privileges exclude it -- so a block cannot be marked completed without going
-- through complete_sport_block().
--
-- `event_id` on games is deliberately a bare nullable uuid with no foreign key.
-- Games happen at calendar events, but the calendar (`Event`) does not exist yet;
-- until it does, a game carries its own date, time and court. Add the FK when
-- the events table lands.

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

-- Any app role at all. Used to let every role READ competition data without
-- naming all six, and SECURITY DEFINER so the policy does not recurse into
-- user_roles' own RLS (same reasoning as has_role()).
CREATE OR REPLACE FUNCTION public.has_any_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_roles where user_id = auth.uid());
$function$;

-- Who may update sports standings (project_spec.md 1.5).
CREATE OR REPLACE FUNCTION public.can_score_competition()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_role('admin') or public.has_role('program');
$function$;

-- ---------------------------------------------------------------------------
-- Teams: ministry_teams becomes the spec's `Team`
--
-- `session` was the old name for what registrations already call `division`.
-- It was nullable, and the team screen offered "Both sessions". A team now has
-- exactly one division, because Juniors and Ambassadors are ranked separately.
-- If any team still has a null session this fails loudly on SET NOT NULL
-- rather than guessing a division for it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ministry_teams RENAME COLUMN session TO division;
ALTER TABLE public.ministry_teams DROP CONSTRAINT ministry_teams_session_chk;
ALTER TABLE public.ministry_teams
  ADD CONSTRAINT ministry_teams_division_values CHECK (division IN ('juniors', 'ambassadors'));
ALTER TABLE public.ministry_teams ALTER COLUMN division SET NOT NULL;

ALTER TABLE public.ministry_teams
  ADD COLUMN season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE,
  ADD COLUMN color text;

UPDATE public.ministry_teams
   SET season_id = (SELECT id FROM public.seasons WHERE is_current LIMIT 1)
 WHERE season_id IS NULL;

ALTER TABLE public.ministry_teams ALTER COLUMN season_id SET NOT NULL;

ALTER TABLE public.ministry_teams
  ADD CONSTRAINT ministry_teams_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT ministry_teams_season_division_name_key UNIQUE (season_id, division, name);

-- New teams default to the current season, so the existing team screen keeps
-- working without sending a season. Same pattern as set_day_season().
CREATE OR REPLACE FUNCTION public.set_team_season()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.season_id is null then
    select id into new.season_id from public.seasons where is_current limit 1;
  end if;
  return new;
end $function$;

CREATE TRIGGER ministry_teams_set_season
  BEFORE INSERT ON public.ministry_teams
  FOR EACH ROW EXECUTE FUNCTION public.set_team_season();

-- Read: every role (a standings table needs team names). Write: Admin only, as
-- before -- is_staff() is has_role('admin').
DROP POLICY "read teams" ON public.ministry_teams;
DROP POLICY "staff teams" ON public.ministry_teams;

CREATE POLICY "read teams" ON public.ministry_teams
  FOR SELECT TO authenticated
  USING (public.has_any_role());

CREATE POLICY "admin manage teams" ON public.ministry_teams
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Every role views standings, so every role must be able to find the current
-- season. Current only: parents were deliberately limited to it
-- (20260928120000_parent_registration.sql), and past seasons stay with Admin and
-- Coach, who already read them.
CREATE POLICY "any role reads current season" ON public.seasons
  FOR SELECT TO authenticated
  USING (is_current AND public.has_any_role());

-- ---------------------------------------------------------------------------
-- sport_blocks
-- ---------------------------------------------------------------------------

CREATE TABLE public.sport_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  division text NOT NULL,
  -- Free text, not a check of four values: sports change season to season. The
  -- list of known sports and their scoring lives in src/lib/competition/scores.ts.
  sport text NOT NULL,
  format text NOT NULL,
  -- How a league stage is laid out. Null for knockout-only blocks.
  league_structure text,
  status text NOT NULL DEFAULT 'setup',
  starts_on date,
  ends_on date,
  -- Per-sport knobs: sets or rounds per game, game length, and so on.
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT sport_blocks_division_values CHECK (division IN ('juniors', 'ambassadors')),
  CONSTRAINT sport_blocks_sport_not_blank CHECK (char_length(btrim(sport)) > 0),
  CONSTRAINT sport_blocks_format_values CHECK (format IN ('league', 'knockout', 'league_knockout')),
  CONSTRAINT sport_blocks_league_structure_values CHECK (
    league_structure IS NULL OR league_structure IN ('round_robin', 'groups')
  ),
  -- Knockout-only has no league stage; everything else must say how it is laid
  -- out. Groups only make sense when a knockout follows to seed from them.
  -- Written with explicit IS [NOT] NULL: a CHECK passes when its expression is
  -- NULL, so `league_structure = 'round_robin'` alone would let a missing
  -- structure through.
  CONSTRAINT sport_blocks_league_structure_matches_format CHECK (
    (format = 'knockout' AND league_structure IS NULL)
    OR (format = 'league' AND league_structure IS NOT NULL AND league_structure = 'round_robin')
    OR (format = 'league_knockout' AND league_structure IS NOT NULL)
  ),
  CONSTRAINT sport_blocks_status_values CHECK (status IN ('setup', 'league', 'knockout', 'completed')),
  CONSTRAINT sport_blocks_dates_ordered CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT sport_blocks_season_division_sport_key UNIQUE (season_id, division, sport)
);

CREATE TRIGGER sport_blocks_touch_updated_at
  BEFORE UPDATE ON public.sport_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------

CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_block_id uuid NOT NULL REFERENCES public.sport_blocks(id) ON DELETE CASCADE,
  -- Both nullable: in a knockout either slot can be waiting on an earlier game.
  -- RESTRICT so deleting a team that has played cannot silently orphan games.
  home_team_id uuid REFERENCES public.ministry_teams(id) ON DELETE RESTRICT,
  away_team_id uuid REFERENCES public.ministry_teams(id) ON DELETE RESTRICT,
  stage text NOT NULL,
  group_label text,
  round integer NOT NULL,
  label text NOT NULL,
  -- See the header: no FK until the calendar exists.
  event_id uuid,
  scheduled_date date,
  scheduled_time time without time zone,
  court integer,
  status text NOT NULL DEFAULT 'scheduled',

  -- Where this game's winner and loser go next, if they go to another game...
  winner_to_game_id uuid REFERENCES public.games(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE,
  winner_to_slot text,
  loser_to_game_id uuid REFERENCES public.games(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE,
  loser_to_slot text,
  -- ...or the final place they take, if this game decides one.
  winner_place integer,
  loser_place integer,

  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT games_stage_values CHECK (stage IN ('league', 'knockout', 'placement')),
  CONSTRAINT games_status_values CHECK (status IN ('scheduled', 'completed')),
  CONSTRAINT games_group_label_values CHECK (
    group_label IS NULL OR (group_label IN ('A', 'B') AND stage = 'league')
  ),
  CONSTRAINT games_round_positive CHECK (round >= 1),
  CONSTRAINT games_court_positive CHECK (court IS NULL OR court >= 1),
  CONSTRAINT games_slot_values CHECK (
    (winner_to_slot IS NULL OR winner_to_slot IN ('home', 'away'))
    AND (loser_to_slot IS NULL OR loser_to_slot IN ('home', 'away'))
  ),
  CONSTRAINT games_edge_pairs CHECK (
    (winner_to_game_id IS NULL) = (winner_to_slot IS NULL)
    AND (loser_to_game_id IS NULL) = (loser_to_slot IS NULL)
  ),
  CONSTRAINT games_place_positive CHECK (
    (winner_place IS NULL OR winner_place >= 1) AND (loser_place IS NULL OR loser_place >= 1)
  ),
  -- A league game leads nowhere. Every other game sends its winner AND its loser
  -- somewhere, to exactly one of a later game or a final place, so no team can
  -- fall out of the bracket without a place.
  CONSTRAINT games_exits_shape CHECK (
    CASE WHEN stage = 'league'
      THEN winner_to_game_id IS NULL AND loser_to_game_id IS NULL
           AND winner_place IS NULL AND loser_place IS NULL
      ELSE (winner_to_game_id IS NOT NULL) <> (winner_place IS NOT NULL)
           AND (loser_to_game_id IS NOT NULL) <> (loser_place IS NOT NULL)
    END
  ),
  CONSTRAINT games_distinct_teams CHECK (
    home_team_id IS NULL OR away_team_id IS NULL OR home_team_id <> away_team_id
  )
);

CREATE INDEX games_block_idx ON public.games (sport_block_id);
CREATE INDEX games_winner_to_idx ON public.games (winner_to_game_id) WHERE winner_to_game_id IS NOT NULL;
CREATE INDEX games_loser_to_idx ON public.games (loser_to_game_id) WHERE loser_to_game_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- game_results
-- ---------------------------------------------------------------------------

CREATE TABLE public.game_results (
  game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  -- Goals or points (soccer, basketball), sets won (volleyball), rounds won
  -- (dodgeball). The per-sport breakdown is in `details`.
  home_total integer NOT NULL,
  away_total integer NOT NULL,
  -- Validated per sport by the Server Action (Zod); the database only checks
  -- that it is an object and that the totals are consistent.
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Null only for a drawn league game.
  winner_team_id uuid REFERENCES public.ministry_teams(id) ON DELETE RESTRICT,
  -- Set only when a knockout / placement game's totals are level.
  tiebreak_winner_team_id uuid REFERENCES public.ministry_teams(id) ON DELETE RESTRICT,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT game_results_totals_nonneg CHECK (home_total >= 0 AND away_total >= 0),
  CONSTRAINT game_results_details_object CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT game_results_tiebreak_is_winner CHECK (
    tiebreak_winner_team_id IS NULL OR tiebreak_winner_team_id = winner_team_id
  )
);

-- ---------------------------------------------------------------------------
-- sport_block_places
-- ---------------------------------------------------------------------------

CREATE TABLE public.sport_block_places (
  sport_block_id uuid NOT NULL REFERENCES public.sport_blocks(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.ministry_teams(id) ON DELETE RESTRICT,
  place integer NOT NULL,

  PRIMARY KEY (sport_block_id, team_id),
  CONSTRAINT sport_block_places_place_positive CHECK (place >= 1),
  CONSTRAINT sport_block_places_place_unique UNIQUE (sport_block_id, place)
);

-- ---------------------------------------------------------------------------
-- Guard: a block's identity and shape are frozen once it has games
--
-- Changing the format, structure, sport, division or season of a block that
-- already has games would leave those games meaning something else. The
-- prototype's equivalent (re-saving sport settings) deleted every game.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_sport_block_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.season_id, new.division, new.sport, new.format, new.league_structure)
     is distinct from
     (old.season_id, old.division, old.sport, old.format, old.league_structure)
     and exists (select 1 from public.games where sport_block_id = old.id)
  then
    raise exception 'This block already has games. Reset the block before changing its sport, division, season or format.'
      using errcode = '55000';
  end if;
  return new;
end $function$;

CREATE TRIGGER sport_blocks_guard_shape
  BEFORE UPDATE ON public.sport_blocks
  FOR EACH ROW EXECUTE FUNCTION public.guard_sport_block_shape();

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.sport_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_block_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read sport_blocks" ON public.sport_blocks
  FOR SELECT TO authenticated USING (public.has_any_role());
CREATE POLICY "read games" ON public.games
  FOR SELECT TO authenticated USING (public.has_any_role());
CREATE POLICY "read game_results" ON public.game_results
  FOR SELECT TO authenticated USING (public.has_any_role());
CREATE POLICY "read sport_block_places" ON public.sport_block_places
  FOR SELECT TO authenticated USING (public.has_any_role());

-- Admin and Program Team edit blocks directly; every other table is RPC-only.
CREATE POLICY "scorers manage sport_blocks" ON public.sport_blocks
  FOR ALL TO authenticated
  USING (public.can_score_competition())
  WITH CHECK (public.can_score_competition());

-- Supabase grants new tables to anon / authenticated by default. Start from
-- nothing and give back only what is meant to be reachable. `status` is left out
-- of the column lists on purpose: only the functions below may change it.
REVOKE ALL ON public.sport_blocks FROM anon, authenticated;
REVOKE ALL ON public.games FROM anon, authenticated;
REVOKE ALL ON public.game_results FROM anon, authenticated;
REVOKE ALL ON public.sport_block_places FROM anon, authenticated;

GRANT SELECT ON public.sport_blocks, public.games, public.game_results, public.sport_block_places
  TO authenticated;
GRANT INSERT (season_id, division, sport, format, league_structure, starts_on, ends_on, settings)
  ON public.sport_blocks TO authenticated;
GRANT UPDATE (season_id, division, sport, format, league_structure, starts_on, ends_on, settings)
  ON public.sport_blocks TO authenticated;
GRANT DELETE ON public.sport_blocks TO authenticated;

-- ---------------------------------------------------------------------------
-- Parsing helper for create_sport_block_games()
--
-- Games arrive as a jsonb array with temporary string keys, because the real
-- ids do not exist yet and games point at each other. Kept as a function rather
-- than a temp table: a SECURITY DEFINER function must not depend on pg_temp,
-- which a caller can populate to shadow real tables.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._parse_competition_games(p_games jsonb)
 RETURNS TABLE(
   key text, stage text, round integer, label text, group_label text,
   home_team_id uuid, away_team_id uuid,
   wt_key text, wt_slot text, lt_key text, lt_slot text,
   winner_place integer, loser_place integer
 )
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select
    e->>'key',
    e->>'stage',
    (e->>'round')::integer,
    e->>'label',
    nullif(e->>'group_label', ''),
    nullif(e->>'home_team_id', '')::uuid,
    nullif(e->>'away_team_id', '')::uuid,
    e->'winner_to'->>'key',
    e->'winner_to'->>'slot',
    e->'loser_to'->>'key',
    e->'loser_to'->>'slot',
    (e->>'winner_place')::integer,
    (e->>'loser_place')::integer
  from jsonb_array_elements(p_games) e;
$function$;

REVOKE ALL ON FUNCTION public._parse_competition_games(jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_sport_block_games
--
-- Inserts a whole generated schedule or bracket in one statement. Allowed only
-- when it moves the block forward:
--   setup  + league / league_knockout -> league games only      -> status 'league'
--   setup  + knockout                 -> knockout games only    -> status 'knockout'
--   league + league_knockout          -> knockout games only, and only once every
--                                        league game has a result -> 'knockout'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_sport_block_games(p_block_id uuid, p_games jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_block public.sport_blocks%rowtype;
  v_map jsonb;
  v_n integer;
  v_league integer;
  v_other integer;
  v_teams uuid[];
  v_existing_teams uuid[];
  v_found integer;
  v_next text;
  v_existing_league integer;
  v_existing_open integer;
begin
  if not public.can_score_competition() then
    raise exception 'Only Admin or Program Team can create games.' using errcode = '42501';
  end if;

  select * into v_block from public.sport_blocks where id = p_block_id for update;
  if not found then
    raise exception 'Sport block not found.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_games) is distinct from 'array' or jsonb_array_length(p_games) = 0 then
    raise exception 'Games must be a non-empty array.' using errcode = '22023';
  end if;

  -- Keys: present and unique.
  if exists (select 1 from public._parse_competition_games(p_games) where key is null or key = '')
     or exists (select 1 from public._parse_competition_games(p_games) group by key having count(*) > 1)
  then
    raise exception 'Every game needs a unique key.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public._parse_competition_games(p_games)
     where stage is null or stage not in ('league', 'knockout', 'placement')
        or round is null or round < 1 or label is null or btrim(label) = ''
        or (group_label is not null and (group_label not in ('A', 'B') or stage <> 'league'))
  ) then
    raise exception 'Each game needs a valid stage, round and label.' using errcode = '22023';
  end if;

  select count(*) filter (where stage = 'league'), count(*) filter (where stage <> 'league')
    into v_league, v_other
    from public._parse_competition_games(p_games);

  -- Which stage may be created now.
  if v_block.status = 'setup' and v_block.format in ('league', 'league_knockout') then
    if v_other > 0 then
      raise exception 'Create the league games first; the knockout stage is generated once the league is finished.'
        using errcode = '55000';
    end if;
    v_next := 'league';
  elsif v_block.status = 'setup' and v_block.format = 'knockout' then
    if v_league > 0 then
      raise exception 'A knockout block has no league games.' using errcode = '22023';
    end if;
    v_next := 'knockout';
  elsif v_block.status = 'league' and v_block.format = 'league_knockout' then
    if v_league > 0 then
      raise exception 'The league games already exist.' using errcode = '55000';
    end if;
    select count(*), count(*) filter (where status <> 'completed')
      into v_existing_league, v_existing_open
      from public.games where sport_block_id = p_block_id and stage = 'league';
    if v_existing_league = 0 or v_existing_open > 0 then
      raise exception 'Every league game needs a result before the knockout stage can be created.'
        using errcode = '55000';
    end if;
    v_next := 'knockout';
  else
    raise exception 'Games cannot be created for a block that is %.', v_block.status
      using errcode = '55000';
  end if;

  -- League games: both teams known, no exits.
  if exists (
    select 1 from public._parse_competition_games(p_games)
     where stage = 'league'
       and (home_team_id is null or away_team_id is null
            or wt_key is not null or lt_key is not null
            or winner_place is not null or loser_place is not null)
  ) then
    raise exception 'League games need both teams and no progression.' using errcode = '22023';
  end if;

  -- Knockout / placement games: exactly one exit per side.
  if exists (
    select 1 from public._parse_competition_games(p_games)
     where stage <> 'league'
       and ((wt_key is not null) = (winner_place is not null)
            or (lt_key is not null) = (loser_place is not null)
            or (wt_key is not null and (wt_slot is null or wt_slot not in ('home', 'away')))
            or (lt_key is not null and (lt_slot is null or lt_slot not in ('home', 'away'))))
  ) then
    raise exception 'Each knockout game needs one exit for its winner and one for its loser.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public._parse_competition_games(p_games)
     where home_team_id is not null and home_team_id = away_team_id
  ) then
    raise exception 'A team cannot play itself.' using errcode = '22023';
  end if;

  -- Edges: targets exist, are not league games, come later, and no slot is
  -- claimed twice or already holds a seeded team.
  if exists (
    with edges as (
      select key as src, round as src_round, wt_key as tgt, wt_slot as slot from public._parse_competition_games(p_games) where wt_key is not null
      union all
      select key, round, lt_key, lt_slot from public._parse_competition_games(p_games) where lt_key is not null
    )
    select 1 from edges e
      left join public._parse_competition_games(p_games) t on t.key = e.tgt
     where t.key is null
        or t.stage = 'league'
        or t.round <= e.src_round
        or (e.slot = 'home' and t.home_team_id is not null)
        or (e.slot = 'away' and t.away_team_id is not null)
  ) then
    raise exception 'A game points at a missing, earlier or already-filled slot.' using errcode = '22023';
  end if;

  if exists (
    with edges as (
      select wt_key as tgt, wt_slot as slot from public._parse_competition_games(p_games) where wt_key is not null
      union all
      select lt_key, lt_slot from public._parse_competition_games(p_games) where lt_key is not null
    )
    select 1 from edges group by tgt, slot having count(*) > 1
  ) then
    raise exception 'Two games feed the same slot.' using errcode = '22023';
  end if;

  -- Teams: distinct, 6 to 8, all of this block's season and division.
  select coalesce(array_agg(distinct t), '{}') into v_teams
    from (
      select home_team_id as t from public._parse_competition_games(p_games)
      union
      select away_team_id from public._parse_competition_games(p_games)
    ) x where t is not null;

  if coalesce(array_length(v_teams, 1), 0) not between 6 and 8 then
    raise exception 'A sport block needs between 6 and 8 teams.' using errcode = '22023';
  end if;

  select count(*) into v_found
    from public.ministry_teams
   where id = any (v_teams) and season_id = v_block.season_id and division = v_block.division;
  if v_found <> array_length(v_teams, 1) then
    raise exception 'Every team must belong to this block''s season and division.' using errcode = '22023';
  end if;

  -- A knockout stage must use exactly the teams that played the league.
  if v_next = 'knockout' and v_block.format = 'league_knockout' then
    select array_agg(distinct t) into v_existing_teams
      from (
        select home_team_id as t from public.games where sport_block_id = p_block_id
        union
        select away_team_id from public.games where sport_block_id = p_block_id
      ) x where t is not null;
    if not (v_teams <@ v_existing_teams and v_existing_teams <@ v_teams) then
      raise exception 'The knockout stage must use the same teams as the league.' using errcode = '22023';
    end if;
  end if;

  v_map := (
    select jsonb_object_agg(key, gen_random_uuid()::text)
      from public._parse_competition_games(p_games)
  );

  -- One statement, so the self-referencing foreign keys are checked once every
  -- row exists.
  insert into public.games (
    id, sport_block_id, home_team_id, away_team_id, stage, group_label, round, label,
    winner_to_game_id, winner_to_slot, loser_to_game_id, loser_to_slot, winner_place, loser_place
  )
  select
    (v_map ->> key)::uuid, p_block_id, home_team_id, away_team_id, stage, group_label, round, label,
    (v_map ->> wt_key)::uuid, wt_slot, (v_map ->> lt_key)::uuid, lt_slot, winner_place, loser_place
  from public._parse_competition_games(p_games);
  get diagnostics v_n = row_count;

  update public.sport_blocks set status = v_next where id = p_block_id;

  return v_n;
end $function$;

-- ---------------------------------------------------------------------------
-- record_game_result
--
-- One transaction: validate, write the result, mark the game completed, and put
-- the winner and loser into the games they feed. Re-recording a result is an
-- edit; it re-slots the teams, unless that would change a team in a game that has
-- itself been played, in which case that later game must be cleared first. A
-- score correction that keeps the same winner is always fine.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_game_result(
  p_game_id uuid,
  p_home_total integer,
  p_away_total integer,
  p_tiebreak_winner uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.games%rowtype;
  v_block public.sport_blocks%rowtype;
  v_winner uuid;
  v_loser uuid;
begin
  if not public.can_score_competition() then
    raise exception 'Only Admin or Program Team can record results.' using errcode = '42501';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;

  -- Lock order is always block, then game, then downstream games.
  select * into v_block from public.sport_blocks where id = v_game.sport_block_id for update;
  select * into v_game from public.games where id = p_game_id for update;

  if v_block.status = 'completed' then
    raise exception 'This block is completed. Reset it to change results.' using errcode = '55000';
  end if;
  if v_game.home_team_id is null or v_game.away_team_id is null then
    raise exception 'Both teams must be known before a result can be recorded.' using errcode = '55000';
  end if;
  if v_game.stage = 'league' and v_block.status <> 'league' then
    raise exception 'League results are locked once the knockout stage has been created.' using errcode = '55000';
  end if;

  if p_home_total is null or p_away_total is null or p_home_total < 0 or p_away_total < 0 then
    raise exception 'Scores must be zero or more.' using errcode = '22023';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Score details must be an object.' using errcode = '22023';
  end if;

  if p_home_total > p_away_total then
    v_winner := v_game.home_team_id;
  elsif p_away_total > p_home_total then
    v_winner := v_game.away_team_id;
  end if;

  if v_game.stage = 'league' then
    if p_tiebreak_winner is not null then
      raise exception 'League games do not use a tiebreak winner.' using errcode = '22023';
    end if;
  elsif v_winner is null then
    if p_tiebreak_winner is null or p_tiebreak_winner not in (v_game.home_team_id, v_game.away_team_id) then
      raise exception 'A level knockout game needs a tiebreak winner from one of its two teams.' using errcode = '22023';
    end if;
    v_winner := p_tiebreak_winner;
  elsif p_tiebreak_winner is not null then
    raise exception 'A tiebreak winner is only for a level score.' using errcode = '22023';
  end if;

  if v_winner is not null then
    v_loser := case when v_winner = v_game.home_team_id then v_game.away_team_id else v_game.home_team_id end;
  end if;

  -- Downstream games: lock them, and refuse if a team would have to change in a
  -- game that has already been played. Correcting a score without changing who
  -- won leaves those games valid, so that stays allowed.
  perform 1 from public.games
   where id in (v_game.winner_to_game_id, v_game.loser_to_game_id)
   order by id for update;
  if exists (
    select 1 from public.games d
     where d.status = 'completed'
       and (
         (d.id = v_game.winner_to_game_id
           and (case when v_game.winner_to_slot = 'home' then d.home_team_id else d.away_team_id end)
               is distinct from v_winner)
         or
         (d.id = v_game.loser_to_game_id
           and (case when v_game.loser_to_slot = 'home' then d.home_team_id else d.away_team_id end)
               is distinct from v_loser)
       )
  ) then
    raise exception 'A later game these teams advanced into has already been played. Clear that result first.'
      using errcode = '55000';
  end if;

  insert into public.game_results (
    game_id, home_total, away_total, details, winner_team_id, tiebreak_winner_team_id, recorded_by, recorded_at
  ) values (
    p_game_id, p_home_total, p_away_total, p_details, v_winner, p_tiebreak_winner, auth.uid(), now()
  )
  on conflict (game_id) do update set
    home_total = excluded.home_total,
    away_total = excluded.away_total,
    details = excluded.details,
    winner_team_id = excluded.winner_team_id,
    tiebreak_winner_team_id = excluded.tiebreak_winner_team_id,
    recorded_by = excluded.recorded_by,
    recorded_at = excluded.recorded_at;

  update public.games set status = 'completed' where id = p_game_id;

  if v_game.winner_to_game_id is not null then
    if v_game.winner_to_slot = 'home' then
      update public.games set home_team_id = v_winner where id = v_game.winner_to_game_id;
    else
      update public.games set away_team_id = v_winner where id = v_game.winner_to_game_id;
    end if;
  end if;
  if v_game.loser_to_game_id is not null then
    if v_game.loser_to_slot = 'home' then
      update public.games set home_team_id = v_loser where id = v_game.loser_to_game_id;
    else
      update public.games set away_team_id = v_loser where id = v_game.loser_to_game_id;
    end if;
  end if;
end $function$;

-- ---------------------------------------------------------------------------
-- clear_game_result
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_game_result(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game public.games%rowtype;
  v_block public.sport_blocks%rowtype;
begin
  if not public.can_score_competition() then
    raise exception 'Only Admin or Program Team can clear results.' using errcode = '42501';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;

  select * into v_block from public.sport_blocks where id = v_game.sport_block_id for update;
  select * into v_game from public.games where id = p_game_id for update;

  if v_block.status = 'completed' then
    raise exception 'This block is completed. Reset it to change results.' using errcode = '55000';
  end if;
  if v_game.status <> 'completed' then
    raise exception 'This game has no result to clear.' using errcode = '55000';
  end if;
  if v_game.stage = 'league' and v_block.status <> 'league' then
    raise exception 'League results are locked once the knockout stage has been created.' using errcode = '55000';
  end if;

  perform 1 from public.games
   where id in (v_game.winner_to_game_id, v_game.loser_to_game_id)
   order by id for update;
  if exists (
    select 1 from public.games
     where id in (v_game.winner_to_game_id, v_game.loser_to_game_id) and status = 'completed'
  ) then
    raise exception 'A later game these teams advanced into has already been played. Clear that result first.'
      using errcode = '55000';
  end if;

  if v_game.winner_to_game_id is not null then
    if v_game.winner_to_slot = 'home' then
      update public.games set home_team_id = null where id = v_game.winner_to_game_id;
    else
      update public.games set away_team_id = null where id = v_game.winner_to_game_id;
    end if;
  end if;
  if v_game.loser_to_game_id is not null then
    if v_game.loser_to_slot = 'home' then
      update public.games set home_team_id = null where id = v_game.loser_to_game_id;
    else
      update public.games set away_team_id = null where id = v_game.loser_to_game_id;
    end if;
  end if;

  delete from public.game_results where game_id = p_game_id;
  update public.games set status = 'scheduled' where id = p_game_id;
end $function$;

-- ---------------------------------------------------------------------------
-- complete_sport_block
--
-- Writes each team's final place and closes the block.
--   league:                       the caller passes the ranked team ids (best
--                                 first); the ranking rules live in TypeScript,
--                                 so the database only checks it is a permutation
--                                 of the block's teams.
--   knockout / league_knockout:   places come from the games' own exits
--                                 (winner_place / loser_place) and must cover
--                                 exactly 1..N.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_sport_block(p_block_id uuid, p_places uuid[] DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_block public.sport_blocks%rowtype;
  v_teams uuid[];
  v_n integer;
  v_open integer;
  v_games integer;
begin
  if not public.can_score_competition() then
    raise exception 'Only Admin or Program Team can complete a block.' using errcode = '42501';
  end if;

  select * into v_block from public.sport_blocks where id = p_block_id for update;
  if not found then
    raise exception 'Sport block not found.' using errcode = 'P0002';
  end if;
  if v_block.status = 'completed' then
    raise exception 'This block is already completed.' using errcode = '55000';
  end if;

  select count(*), count(*) filter (where status <> 'completed')
    into v_games, v_open from public.games where sport_block_id = p_block_id;
  if v_games = 0 or v_open > 0 then
    raise exception 'Every game needs a result before the block can be completed.' using errcode = '55000';
  end if;

  select array_agg(distinct t) into v_teams
    from (
      select home_team_id as t from public.games where sport_block_id = p_block_id
      union
      select away_team_id from public.games where sport_block_id = p_block_id
    ) x where t is not null;
  v_n := array_length(v_teams, 1);

  if v_block.format = 'league' then
    if p_places is null
       or array_length(p_places, 1) is distinct from v_n
       or not (p_places <@ v_teams and v_teams <@ p_places)
    then
      raise exception 'Places must list every team in the block exactly once.' using errcode = '22023';
    end if;

    insert into public.sport_block_places (sport_block_id, team_id, place)
    select p_block_id, team, ord from unnest(p_places) with ordinality as u(team, ord);
  else
    if p_places is not null then
      raise exception 'Places are taken from the bracket for this format.' using errcode = '22023';
    end if;
    if v_block.status <> 'knockout' then
      raise exception 'The knockout stage has not been created yet.' using errcode = '55000';
    end if;

    insert into public.sport_block_places (sport_block_id, team_id, place)
    select p_block_id, team, place from (
      select r.winner_team_id as team, g.winner_place as place
        from public.games g join public.game_results r on r.game_id = g.id
       where g.sport_block_id = p_block_id and g.winner_place is not null
      union all
      select case when r.winner_team_id = g.home_team_id then g.away_team_id else g.home_team_id end,
             g.loser_place
        from public.games g join public.game_results r on r.game_id = g.id
       where g.sport_block_id = p_block_id and g.loser_place is not null
    ) x;

    -- The bracket must decide every place exactly once.
    if (select count(*) from public.sport_block_places where sport_block_id = p_block_id) <> v_n
       or (select max(place) from public.sport_block_places where sport_block_id = p_block_id) <> v_n
    then
      raise exception 'The bracket does not decide a place for every team.' using errcode = '55000';
    end if;
  end if;

  update public.sport_blocks set status = 'completed' where id = p_block_id;
end $function$;

-- ---------------------------------------------------------------------------
-- set_game_schedule
--
-- Batch update of date, time and court, for the auto-scheduler. Items:
--   [{ "game_id": uuid, "scheduled_date": date|null, "scheduled_time": time|null, "court": int|null }]
-- Nulls unschedule a game. Results are untouched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_game_schedule(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_n integer;
begin
  if not public.can_score_competition() then
    raise exception 'Only Admin or Program Team can schedule games.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be an array.' using errcode = '22023';
  end if;

  select array_agg((e ->> 'game_id')::uuid) into v_ids from jsonb_array_elements(p_items) e;
  if v_ids is null then
    return 0;
  end if;

  -- Lock the blocks first so scheduling cannot race a completion.
  perform 1 from public.sport_blocks
   where id in (select sport_block_id from public.games where id = any (v_ids))
   order by id for update;

  if exists (
    select 1 from public.games g join public.sport_blocks b on b.id = g.sport_block_id
     where g.id = any (v_ids) and b.status = 'completed'
  ) then
    raise exception 'This block is completed. Reset it to change the schedule.' using errcode = '55000';
  end if;

  update public.games g set
    scheduled_date = nullif(i.scheduled_date, '')::date,
    scheduled_time = nullif(i.scheduled_time, '')::time,
    court = i.court
  from (
    select (e ->> 'game_id')::uuid as game_id,
           e ->> 'scheduled_date' as scheduled_date,
           e ->> 'scheduled_time' as scheduled_time,
           (e ->> 'court')::integer as court
      from jsonb_array_elements(p_items) e
  ) i
  where g.id = i.game_id;
  get diagnostics v_n = row_count;

  if v_n <> array_length(v_ids, 1) then
    raise exception 'One or more games were not found.' using errcode = 'P0002';
  end if;
  return v_n;
end $function$;

-- ---------------------------------------------------------------------------
-- reset_sport_block
--
-- The explicit way to start a block over: deletes its games, results and places
-- and puts it back in 'setup'. The only way to change a block's format after
-- games exist, so the caller is expected to confirm first.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_sport_block(p_block_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_score_competition() then
    raise exception 'Only Admin or Program Team can reset a block.' using errcode = '42501';
  end if;

  perform 1 from public.sport_blocks where id = p_block_id for update;
  if not found then
    raise exception 'Sport block not found.' using errcode = 'P0002';
  end if;

  delete from public.sport_block_places where sport_block_id = p_block_id;
  delete from public.games where sport_block_id = p_block_id;
  update public.sport_blocks set status = 'setup' where id = p_block_id;
end $function$;

-- ---------------------------------------------------------------------------
-- Function privileges: signed-in users only, never anon.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_sport_block_games(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_game_result(uuid, integer, integer, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_game_result(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_sport_block(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_game_schedule(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_sport_block(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_score_competition() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_sport_block_games(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_result(uuid, integer, integer, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_game_result(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sport_block(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_game_schedule(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_sport_block(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_score_competition() TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live standings and bracket (project_spec.md 2.3). RLS still applies
-- to what each subscriber receives.
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.sport_blocks, public.games, public.game_results;
