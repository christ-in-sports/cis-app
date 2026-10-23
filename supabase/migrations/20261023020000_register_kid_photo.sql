-- register_kid() takes a photo, and requires one (ENG-21 / ENG-24).
--
-- Every kid saved through the app has a photo. This ships with the parent form
-- that uploads one, not with the photo schema (20261022233000_kid_photos.sql),
-- because requiring it before the form could supply it would have broken parent
-- registration on main.
--
-- The change, against 20260928120000_parent_registration.sql:
--
--   * a new argument, p_photo_path: the object the browser uploaded to the
--     kid-photos bucket as the parent. It is attached with attach_kid_photo(),
--     in the same transaction as the kid and the registration, so a rejected
--     registration never leaves a kid pointing at a photo. That function checks
--     the upload exists, was uploaded by the caller and is not another kid's.
--   * a new kid must send one. A returning kid must too, unless they already
--     have a photo on file; one sent for a returning kid replaces it.
--   * a new result column, old_photo_path: the file a replacement displaced
--     (null when there was none), which the Server Action deletes after the
--     registration is saved. Postgres cannot: storage.protect_delete() refuses
--     direct deletes.
--
-- Everything else is unchanged, including who may call it and the locked
-- identity fields. The old four-argument function is dropped rather than left
-- beside this one, so there is no way to register a kid without a photo by
-- calling it with fewer arguments.
--
-- Adding a column to the result changes the return type, which CREATE OR
-- REPLACE cannot do, hence DROP then CREATE. The grants are restated below.
--
-- New error codes, in addition to the ones the function already documents:
--   22004  a photo is required (new kid, or returning kid with none on file)
--   02000  the upload was not found (missing, not the caller's, badly named)
--   23505  also raised when the photo is already another kid's; the message
--          mentions the photo, which is how it is told from a duplicate kid

DROP FUNCTION public.register_kid(uuid, jsonb, jsonb, boolean);

CREATE FUNCTION public.register_kid(
  p_kid_id uuid,
  p_kid jsonb,
  p_registration jsonb,
  p_consent boolean,
  p_photo_path text DEFAULT NULL
)
 RETURNS TABLE(kid_id uuid, registration_id uuid, old_photo_path text)
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
  v_old_photo text;
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

  -- A new kid needs a photo. A returning kid needs one too, but may already have
  -- one on file, so that is checked once the kid is known, below.
  if p_kid_id is null and p_photo_path is null then
    raise exception 'A photo is required'
      using errcode = '22004';
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

  -- The photo. attach_kid_photo() checks that the upload exists, is the
  -- caller's and is not another kid's, and returns the file it replaced so the
  -- Server Action can delete it. A returning kid who already has a photo may
  -- leave this out.
  if p_photo_path is not null then
    v_old_photo := public.attach_kid_photo(v_kid, p_photo_path);
  elsif not exists (select 1 from kids k where k.id = v_kid and k.photo_path is not null) then
    raise exception 'A photo is required'
      using errcode = '22004';
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

  return query select v_kid, v_reg, v_old_photo;
end $function$;

REVOKE ALL ON FUNCTION public.register_kid(uuid, jsonb, jsonb, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_kid(uuid, jsonb, jsonb, boolean, text) TO authenticated;
