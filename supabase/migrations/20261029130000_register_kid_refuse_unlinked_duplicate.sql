-- register_kid() refuses a kid who is already on file with no parent (ENG-29).
--
-- The app is the main way a parent registers a kid. The CSV import is the backup:
-- it holds the families who could not use the app and filled in the Google Form
-- instead. Those kids have no parent_user_id. Now that link_my_kids() is gone
-- (20261029120000_retire_link_my_kids.sql), such a parent who later joins and
-- registers the same child from scratch would get a second kid row, and the
-- roster would show the child twice.
--
-- register_kid() already refuses a duplicate among the caller's own kids. This
-- adds a refusal when an UNLINKED kid has the same first name, last name and date
-- of birth (trimmed, case-insensitive: the returning-kid key, kids_identity_idx).
-- Twins differ by first name, so they are unaffected. It does not adopt the kid,
-- because that would give a stranger's typed name and birthday access to the
-- kid's address, emergency contact, photo and payments. An Admin attaches the
-- kid to the parent's account instead (ENG-30).
--
-- Only unlinked kids are checked. A kid linked to another parent still lets a
-- second guardian create their own row, since a kid has one linked parent for now
-- (docs/arch_decisions.md, 2026-10-25).
--
-- Same signature, return type and grants as before, so this is CREATE OR REPLACE.
--
-- New error code, in addition to the ones the function already documents:
--   55007  a kid with this name and date of birth is already on file with no
--          parent; ask an Admin to attach them

CREATE OR REPLACE FUNCTION public.register_kid(
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

    -- A kid with this name and date of birth is already on file and belongs to
    -- no parent: it came from the Google Form backup, through the CSV import.
    -- Do not create a second row for the same child, and do not adopt it either.
    -- Handing a kid's address, emergency contact and photo to whoever types a
    -- name and a birthday is the email-matching problem again (ENG-29). An
    -- Admin attaches it to the right parent instead. The message names no kid,
    -- because these are minors' records.
    if exists (
      select 1 from kids k
       where k.parent_user_id is null
         and lower(trim(k.first_name)) = lower(trim(p_kid->>'first_name'))
         and lower(trim(k.last_name))  = lower(trim(p_kid->>'last_name'))
         and k.dob = (p_kid->>'dob')::date
    ) then
      raise exception 'That kid is already on file; ask an Admin to attach them to your account'
        using errcode = '55007';
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
