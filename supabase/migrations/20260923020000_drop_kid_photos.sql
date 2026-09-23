-- Remove kid photos entirely (product decision, 2026-09-23).
--
-- Storing photos of minors was scoped into the registration work from the
-- start: a private bucket, `Kid.photo_path` holding an object path rather than
-- a URL, signed URLs on read, and the CSV importer copying each photo across
-- from the Google Drive link the Google Form produces.
--
-- None of it shipped. The Drive half was blocked on service-account access
-- (project_spec.md 2.8) and the team has decided the feature is not worth the
-- complexity for now -- so rather than carry a half-built photo pipeline and a
-- bucket governed by policies nothing writes to, it comes out. Photos may
-- return in a future version; see docs/decisions.md and docs/arch_decisions.md
-- for the reasoning, which is preserved there rather than here.
--
-- Nothing is lost: `photo_path` was never populated (the importer always wrote
-- null) and the bucket has no objects.
--
-- Deliberately dropping rather than leaving unused: a nullable column and a
-- private bucket with read policies referencing minors' records are exactly
-- the kind of thing that looks load-bearing to the next reader.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "read kid photos" ON storage.objects;
DROP POLICY IF EXISTS "admin manage kid photos" ON storage.objects;

DROP FUNCTION IF EXISTS public.can_read_kid_photo(text);

-- The `kid-photos` bucket itself is NOT dropped here, and cannot be: Supabase
-- installs a `storage.protect_delete()` trigger that rejects any direct DELETE
-- on storage.buckets or storage.objects, including from a migration running as
-- the superuser --
--
--   ERROR: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--
-- Deleting it has to go through the Storage API, so it is a one-off manual
-- step per environment rather than something this migration can do:
--
--   curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/kid-photos" \
--        -H "Authorization: Bearer $SERVICE_ROLE_KEY"
--
-- (or Storage -> kid-photos -> Delete bucket in the dashboard).
--
-- Leaving it behind for now is harmless rather than risky: it is empty, it is
-- private, and the two policies that governed reads are dropped above, so
-- nothing can read or write it. Worth removing anyway so the next person does
-- not find a bucket named for a feature that no longer exists.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.kids DROP COLUMN IF EXISTS photo_path;

ALTER TABLE public.import_rows DROP COLUMN IF EXISTS photo_status;
ALTER TABLE public.import_rows DROP COLUMN IF EXISTS photo_path;

-- ---------------------------------------------------------------------------
-- import_commit() -- same function, minus the photo columns
--
-- Recreated in full because plpgsql bodies are not dependency-checked: leaving
-- the old one in place would not fail here, it would fail at the next import.
-- Everything else about it is unchanged; see the original migration's comments
-- for why it is SECURITY DEFINER, why it claims the batch, and how returning
-- kids are matched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_commit(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch       import_batches;
  v_row         import_rows;
  v_kid_id      uuid;
  v_match_count integer;
  v_first       text;
  v_last        text;
  v_dob         date;
  v_inserted    integer := 0;
  v_updated     integer := 0;
  v_ambiguous   integer := 0;
begin
  if not public.has_role('admin') then
    raise exception 'Only an Admin may commit an import'
      using errcode = '42501';
  end if;

  update import_batches
     set status = 'committing'
   where id = p_batch_id
     and status = 'ready'
  returning * into v_batch;

  if v_batch.id is null then
    raise exception 'Import batch % is not ready to commit', p_batch_id
      using errcode = '55000';
  end if;

  for v_row in
    select *
      from import_rows
     where batch_id = p_batch_id
       and parsed is not null
     order by row_number
  loop
    v_first := v_row.parsed -> 'kid' ->> 'first_name';
    v_last  := v_row.parsed -> 'kid' ->> 'last_name';
    v_dob   := (v_row.parsed -> 'kid' ->> 'dob')::date;

    select count(*), (array_agg(k.id order by k.id))[1]
      into v_match_count, v_kid_id
      from kids k
     where lower(trim(k.first_name)) = lower(trim(v_first))
       and lower(trim(k.last_name))  = lower(trim(v_last))
       and k.dob = v_dob;

    if v_match_count > 1 then
      update import_rows
         set action = 'error',
             matched_kid_id = null,
             errors = errors || jsonb_build_array(jsonb_build_object(
               'row', v_row.row_number,
               'column', null,
               'field', null,
               'message', format(
                 'Matches %s existing kids with the same name and date of birth; resolve before importing',
                 v_match_count)))
       where id = v_row.id;

      v_ambiguous := v_ambiguous + 1;
      continue;
    end if;

    if v_kid_id is null then
      insert into kids (
        first_name, last_name, dob, gender,
        email, phone, allergies,
        home_address, emergency_contact_name, emergency_contact_phone,
        guardian_name, guardian_phone, guardian_email, skill_tags
      )
      values (
        v_first,
        v_last,
        v_dob,
        v_row.parsed -> 'kid' ->> 'gender',
        v_row.parsed -> 'kid' ->> 'email',
        v_row.parsed -> 'kid' ->> 'phone',
        v_row.parsed -> 'kid' ->> 'allergies',
        v_row.parsed -> 'kid' ->> 'home_address',
        v_row.parsed -> 'kid' ->> 'emergency_contact_name',
        v_row.parsed -> 'kid' ->> 'emergency_contact_phone',
        v_row.parsed -> 'kid' ->> 'guardian_name',
        v_row.parsed -> 'kid' ->> 'guardian_phone',
        v_row.parsed -> 'kid' ->> 'guardian_email',
        coalesce(
          array(select jsonb_array_elements_text(v_row.parsed -> 'kid' -> 'skill_tags')),
          '{}')
      )
      returning id into v_kid_id;

      v_inserted := v_inserted + 1;

      update import_rows
         set action = 'insert', matched_kid_id = v_kid_id
       where id = v_row.id;
    else
      -- Required fields overwrite outright. Optional ones (email, phone,
      -- allergies) fall back to what is already stored, because a blank cell
      -- means "not answered", not "delete this" -- which matters most for
      -- allergies.
      update kids
         set first_name              = v_first,
             last_name               = v_last,
             gender                  = v_row.parsed -> 'kid' ->> 'gender',
             home_address            = v_row.parsed -> 'kid' ->> 'home_address',
             emergency_contact_name  = v_row.parsed -> 'kid' ->> 'emergency_contact_name',
             emergency_contact_phone = v_row.parsed -> 'kid' ->> 'emergency_contact_phone',
             guardian_name           = v_row.parsed -> 'kid' ->> 'guardian_name',
             guardian_phone          = v_row.parsed -> 'kid' ->> 'guardian_phone',
             guardian_email          = v_row.parsed -> 'kid' ->> 'guardian_email',
             email     = coalesce(v_row.parsed -> 'kid' ->> 'email', kids.email),
             phone     = coalesce(v_row.parsed -> 'kid' ->> 'phone', kids.phone),
             allergies = coalesce(v_row.parsed -> 'kid' ->> 'allergies', kids.allergies)
       where id = v_kid_id;

      v_updated := v_updated + 1;

      update import_rows
         set action = 'update', matched_kid_id = v_kid_id
       where id = v_row.id;
    end if;

    insert into registrations (
      kid_id, season_id, grade, division, tshirt_size, top_sports,
      source, created_by
    )
    values (
      v_kid_id,
      v_batch.season_id,
      (v_row.parsed -> 'registration' ->> 'grade')::integer,
      v_row.parsed -> 'registration' ->> 'division',
      v_row.parsed -> 'registration' ->> 'tshirt_size',
      case
        when jsonb_typeof(v_row.parsed -> 'registration' -> 'top_sports') = 'array'
        then array(select jsonb_array_elements_text(v_row.parsed -> 'registration' -> 'top_sports'))
        else null
      end,
      'import',
      v_batch.uploaded_by
    )
    on conflict (kid_id, season_id) do update
      set grade       = excluded.grade,
          division    = excluded.division,
          tshirt_size = excluded.tshirt_size,
          top_sports  = coalesce(excluded.top_sports, registrations.top_sports),
          active      = true;
  end loop;

  update import_batches
     set status = 'committed',
         committed_at = now()
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'inserted', v_inserted,
    'updated', v_updated,
    'ambiguous', v_ambiguous,
    'skipped_with_errors', v_batch.error_rows
  );
end $function$;
