-- Parent self-service registration (ENG-4).
--
-- Until now only an Admin could write `kids` and `registrations`, and nothing
-- linked a parent to a kid, so a parent had no way to register their own child.
-- This adds the database side of the parent form:
--
--   * register_kid()  -- create a kid (or update a returning one) and write this
--                        season's registration, with consent, in one call.
--   * link_my_kids()  -- attach kids that were imported by CSV to the parent
--                        whose confirmed email matches the kid's guardian_email.
--   * a policy letting a parent read the current season.
--
-- Why functions rather than new RLS write policies for Parent: the same reason
-- as set_registrations_consent() (20260923010000_record_consent.sql).
--   1. A registration is a kid row plus a registration row. One function call is
--      one transaction, so a half-written registration cannot be left behind.
--   2. Consent is a record about a minor. If a parent could INSERT/UPDATE
--      `registrations` directly, the timestamp and the attributed user would be
--      whatever they sent to PostgREST. Both are derived here: now() and
--      auth.uid().
--   3. A blanket UPDATE policy on `kids` would let a parent rewrite the columns
--      they must not touch -- parent_user_id (hand the kid to someone else),
--      skill_tags (staff-assigned), and the identity fields that returning-kid
--      matching relies on. The function updates an explicit list of columns.

-- ---------------------------------------------------------------------------
-- Parents may read the current season
--
-- The form needs to say which season it is registering for. `seasons` was
-- readable by coaches and staff only.
-- ---------------------------------------------------------------------------

CREATE POLICY "parents read current season" ON public.seasons
  FOR SELECT TO authenticated
  USING (is_current AND public.has_role('parent'));

-- ---------------------------------------------------------------------------
-- link_my_kids -- attach imported kids to the parent who owns them
--
-- CSV-imported kids have parent_user_id null (import_commit never sets it). This
-- links them lazily, when the parent opens the form, rather than at signup: it
-- keeps this ticket independent of however signup is built, and it is safe to
-- call repeatedly.
--
-- The match is on guardian_email, case- and whitespace-insensitive, and only
-- counts when the auth email is CONFIRMED. Without that, anyone could sign up
-- with someone else's address and be handed their children's records. Note this
-- relies on email confirmation being enabled in production: with it off,
-- Supabase treats every address as confirmed at signup.
--
-- It only ever fills a null parent_user_id, so it can never take a kid away from
-- the parent who already holds it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_my_kids()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_confirmed timestamptz;
  v_linked integer;
begin
  if not public.has_role('parent') then
    raise exception 'Only a Parent may link kids'
      using errcode = '42501';
  end if;

  select u.email, u.email_confirmed_at
    into v_email, v_confirmed
    from auth.users u
   where u.id = auth.uid();

  if v_email is null or v_confirmed is null then
    return 0;
  end if;

  update kids k
     set parent_user_id = auth.uid()
   where k.parent_user_id is null
     and lower(trim(k.guardian_email)) = lower(trim(v_email));

  get diagnostics v_linked = row_count;
  return v_linked;
end $function$;

REVOKE ALL ON FUNCTION public.link_my_kids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_kids() TO authenticated;

-- ---------------------------------------------------------------------------
-- register_kid -- the parent registration write
--
--   p_kid_id        null to add a new kid; the id of one of the caller's own kids
--                   to re-register a returning one.
--   p_kid           jsonb of kid fields (see below).
--   p_registration  jsonb: grade, division, tshirt_size, top_sports.
--   p_consent       the waiver box. Must be true.
--
-- New kid: every kid field in p_kid is used, and parent_user_id is the caller.
--
-- Returning kid: only the editable columns are updated. first_name, last_name,
-- dob and gender are LOCKED -- they are what returning-kid matching keys on, so
-- a parent editing them could quietly turn one child into another. Any value for
-- them in p_kid is ignored, as is skill_tags. A key absent from p_kid leaves that
-- column alone, so a partial payload cannot blank required data.
--
-- Registration: upserted on (kid_id, season_id), so submitting again in the same
-- season edits it. Consent is re-stamped on every save. An existing
-- registration keeps its `source`, which lets a parent re-save a CSV-imported
-- registration and thereby record the consent the import could not. Once an
-- Admin has placed the kid on a team, the parent can no longer change the
-- registration -- grade and division drive team placement.
--
-- Error codes (the Server Action maps these to messages):
--   42501  not a parent, or not the caller's kid (a missing kid gets the same
--          code, so this cannot be used to probe which ids exist)
--   22023  waiver not agreed
--   55000  no current season
--   55006  registration is on a team; contact an Admin
--   23505  this parent already has a kid with that name and date of birth
--   23514  a CHECK failed (grade range, division rule, T-shirt size)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_kid(
  p_kid_id uuid,
  p_kid jsonb,
  p_registration jsonb,
  p_consent boolean
)
 RETURNS TABLE(kid_id uuid, registration_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_season uuid;
  v_kid uuid;
  v_reg uuid;
  v_team uuid;
  v_top_sports text[];
begin
  -- SECURITY DEFINER bypasses the caller's RLS, so the gate has to be here.
  if not public.has_role('parent') then
    raise exception 'Only a Parent may register a kid'
      using errcode = '42501';
  end if;

  if p_consent is distinct from true then
    raise exception 'The liability waiver must be agreed to'
      using errcode = '22023';
  end if;

  select s.id into v_season from seasons s where s.is_current;
  if v_season is null then
    raise exception 'There is no active season'
      using errcode = '55000';
  end if;

  if p_kid_id is null then
    if exists (
      select 1 from kids k
       where k.parent_user_id = auth.uid()
         and lower(trim(k.first_name)) = lower(trim(p_kid->>'first_name'))
         and lower(trim(k.last_name))  = lower(trim(p_kid->>'last_name'))
         and k.dob = (p_kid->>'dob')::date
    ) then
      raise exception 'You have already added a kid with that name and date of birth'
        using errcode = '23505';
    end if;

    insert into kids (
      first_name, last_name, dob, gender,
      email, phone, allergies,
      home_address, emergency_contact_name, emergency_contact_phone,
      guardian_name, guardian_phone, guardian_email,
      parent_user_id
    ) values (
      trim(p_kid->>'first_name'),
      trim(p_kid->>'last_name'),
      (p_kid->>'dob')::date,
      p_kid->>'gender',
      nullif(trim(p_kid->>'email'), ''),
      nullif(trim(p_kid->>'phone'), ''),
      nullif(trim(p_kid->>'allergies'), ''),
      trim(p_kid->>'home_address'),
      trim(p_kid->>'emergency_contact_name'),
      trim(p_kid->>'emergency_contact_phone'),
      trim(p_kid->>'guardian_name'),
      trim(p_kid->>'guardian_phone'),
      trim(p_kid->>'guardian_email'),
      auth.uid()
    )
    returning id into v_kid;
  else
    update kids k
       set email = case when p_kid ? 'email'
                        then nullif(trim(p_kid->>'email'), '') else k.email end,
           phone = case when p_kid ? 'phone'
                        then nullif(trim(p_kid->>'phone'), '') else k.phone end,
           allergies = case when p_kid ? 'allergies'
                            then nullif(trim(p_kid->>'allergies'), '') else k.allergies end,
           home_address = coalesce(nullif(trim(p_kid->>'home_address'), ''), k.home_address),
           emergency_contact_name =
             coalesce(nullif(trim(p_kid->>'emergency_contact_name'), ''), k.emergency_contact_name),
           emergency_contact_phone =
             coalesce(nullif(trim(p_kid->>'emergency_contact_phone'), ''), k.emergency_contact_phone),
           guardian_name = coalesce(nullif(trim(p_kid->>'guardian_name'), ''), k.guardian_name),
           guardian_phone = coalesce(nullif(trim(p_kid->>'guardian_phone'), ''), k.guardian_phone),
           guardian_email = coalesce(nullif(trim(p_kid->>'guardian_email'), ''), k.guardian_email)
     where k.id = p_kid_id
       and k.parent_user_id = auth.uid()
    returning k.id into v_kid;

    if v_kid is null then
      raise exception 'Kid not found'
        using errcode = '42501';
    end if;
  end if;

  if jsonb_typeof(p_registration->'top_sports') = 'array' then
    v_top_sports := array(select jsonb_array_elements_text(p_registration->'top_sports'));
  end if;

  select r.id, r.team_id
    into v_reg, v_team
    from registrations r
   where r.kid_id = v_kid
     and r.season_id = v_season
   for update;

  if v_reg is not null and v_team is not null then
    raise exception 'This registration is already on a team; contact an Admin to change it'
      using errcode = '55006';
  end if;

  if v_reg is null then
    insert into registrations (
      kid_id, season_id, grade, division, tshirt_size, top_sports,
      consent_given_at, consent_by_user_id, source, created_by
    ) values (
      v_kid, v_season,
      (p_registration->>'grade')::integer,
      p_registration->>'division',
      p_registration->>'tshirt_size',
      v_top_sports,
      now(), auth.uid(), 'parent', auth.uid()
    )
    returning id into v_reg;
  else
    update registrations r
       set grade = (p_registration->>'grade')::integer,
           division = p_registration->>'division',
           tshirt_size = p_registration->>'tshirt_size',
           top_sports = v_top_sports,
           consent_given_at = now(),
           consent_by_user_id = auth.uid()
     where r.id = v_reg;
  end if;

  return query select v_kid, v_reg;
end $function$;

REVOKE ALL ON FUNCTION public.register_kid(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_kid(uuid, jsonb, jsonb, boolean) TO authenticated;
