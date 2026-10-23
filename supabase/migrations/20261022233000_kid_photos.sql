-- Kid photos, database side (ENG-21 / ENG-22).
--
-- Reverses 20260923020000_drop_kid_photos.sql. The product and design reasoning
-- is in docs/decisions.md and docs/arch_decisions.md (both 2026-10-22); this
-- file only says why each piece is shaped the way it is.
--
-- What lands here:
--   * kids.photo_path / kids.photo_updated_at
--   * the private `kid-photos` bucket and its storage.objects policies
--   * set_kid_photo()  -- attach or replace a photo (Admin, or the kid's parent)
--
-- What deliberately does NOT land here: register_kid() accepting a photo and
-- requiring one for a new kid. That rule only works once the parent form can
-- upload, so it ships with the form (ENG-24). Enforcing it now would break
-- parent registration, and its end-to-end test, on main. attach_kid_photo()
-- below is the piece register_kid() will reuse, so the two paths validate an
-- upload identically.
--
-- No service role anywhere. Uploads run as the signed-in user, so the policies
-- below are the permission boundary, and the two functions check roles
-- themselves because SECURITY DEFINER bypasses the caller's RLS.

-- ---------------------------------------------------------------------------
-- Columns
--
-- photo_path is an object name inside the bucket, never a URL: `<uuid>.webp`
-- (or `.jpg` when the browser cannot encode WebP). Names are random rather than
-- derived from the kid because a new kid has no id until register_kid() runs,
-- and the photo has to be uploaded before that. A replacement gets a new name,
-- so a cached signed URL for the old photo can never show the new one.
--
-- Both columns are nullable: CSV-imported kids have no photo until a parent or
-- an Admin adds one. import_commit() names the columns it writes, so it never
-- touches these.
-- ---------------------------------------------------------------------------

ALTER TABLE public.kids
  ADD COLUMN photo_path text,
  ADD COLUMN photo_updated_at timestamptz,
  ADD CONSTRAINT kids_photo_path_key UNIQUE (photo_path),
  ADD CONSTRAINT kids_photo_path_format CHECK (
    photo_path IS NULL
    OR photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
  ),
  ADD CONSTRAINT kids_photo_pair CHECK ((photo_path IS NULL) = (photo_updated_at IS NULL));

-- No new RLS is needed on kids itself: the new columns are visible to exactly
-- the readers of the row (can_read_kid()), and only Admin can write the table.
-- Parents attach photos through set_kid_photo(), which touches only these two
-- columns. attendance_day_roster() lists its columns explicitly, so archived
-- attendance still shows no photos.

-- ---------------------------------------------------------------------------
-- Bucket
--
-- A bucket from the 2026-09-21 design may already exist (the drop migration
-- could not delete it), so this upserts. Either way it ends up private, with
-- the limits enforced by Storage itself whatever the browser does.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kid-photos', 'kid-photos', false, 2097152, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- kid_photo_attached -- is any kid pointing at this object?
--
-- SECURITY DEFINER because the policies below need the answer for every kid,
-- not just the kids the caller may read. Without it, a parent who lost their
-- link to a kid (an Admin reassigned it) would see "no kid uses this photo"
-- and so keep read access to it as its uploader. It returns only a boolean
-- about an unguessable name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kid_photo_attached(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from kids k where k.photo_path = p_path);
$function$;

REVOKE ALL ON FUNCTION public.kid_photo_attached(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kid_photo_attached(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- storage.objects policies
--
-- SELECT   Admin; or anyone who may read the kid whose photo it is; or the
--          uploader while nothing references it yet (the form previews the
--          photo before the kid exists). Once a replaced photo is unreferenced
--          nobody but its uploader and Admin can read it, until it is deleted
--          by hand.
--          The kid check goes through the kids table, so it is already scoped
--          by RLS; can_read_kid() is named anyway so the rule is visible here.
-- INSERT   Admin or Parent, as themselves, under a random `<uuid>.webp|jpg`
--          name. The name check keeps folders and guessable names out.
-- DELETE   Admin or the uploader, and only once no kid references the object.
--          "A photo can be replaced but never removed" therefore holds even for
--          someone calling the Storage API directly. DELETE also needs the
--          SELECT policy to let the caller see the row, which is why Admin may
--          read unreferenced objects above.
-- UPDATE   None. Uploads never overwrite, so a replacement is always a new name.
-- ---------------------------------------------------------------------------

CREATE POLICY "read kid photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kid-photos'
    AND (
      public.has_role('admin')
      OR EXISTS (
        SELECT 1 FROM public.kids k
         WHERE k.photo_path = objects.name
           AND public.can_read_kid(k.id)
      )
      OR (
        owner_id = (SELECT auth.uid())::text
        AND (public.has_role('admin') OR public.has_role('parent'))
        AND NOT public.kid_photo_attached(objects.name)
      )
    )
  );

CREATE POLICY "upload kid photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kid-photos'
    AND (public.has_role('admin') OR public.has_role('parent'))
    AND owner_id = (SELECT auth.uid())::text
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
  );

CREATE POLICY "delete unreferenced kid photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'kid-photos'
    AND NOT public.kid_photo_attached(objects.name)
    AND (public.has_role('admin') OR owner_id = (SELECT auth.uid())::text)
  );

-- ---------------------------------------------------------------------------
-- attach_kid_photo -- the shared write, internal only
--
-- Points a kid at an uploaded object and returns the path it replaced (null if
-- there was none, or it was already this one) so the caller can delete the old
-- file through the Storage API. Postgres cannot: storage.protect_delete()
-- rejects direct deletes.
--
-- The object has to exist in the bucket and have been uploaded by the caller.
-- A missing object and someone else's object get the same error, so the call
-- cannot be used to probe which names exist. Callers must have checked that the
-- caller may touch this kid: this function trusts them, which is why nobody but
-- the function owner can execute it.
--
-- Error codes:
--   02000  the upload was not found (missing, wrong name format, or not yours)
--   23505  another kid already uses this photo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_kid_photo(p_kid uuid, p_path text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner text;
  v_old text;
begin
  if p_path is null
     or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$' then
    raise exception 'Photo upload not found'
      using errcode = '02000';
  end if;

  select o.owner_id
    into v_owner
    from storage.objects o
   where o.bucket_id = 'kid-photos'
     and o.name = p_path;

  if not found or v_owner is distinct from auth.uid()::text then
    raise exception 'Photo upload not found'
      using errcode = '02000';
  end if;

  select k.photo_path
    into v_old
    from kids k
   where k.id = p_kid
   for update;

  if not found then
    raise exception 'Kid not found'
      using errcode = '42501';
  end if;

  if v_old is not distinct from p_path then
    return null;
  end if;

  if exists (select 1 from kids k where k.photo_path = p_path and k.id <> p_kid) then
    raise exception 'That photo is already used by another kid'
      using errcode = '23505';
  end if;

  update kids
     set photo_path = p_path,
         photo_updated_at = now()
   where id = p_kid;

  return v_old;
end $function$;

REVOKE ALL ON FUNCTION public.attach_kid_photo(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_kid_photo -- add or replace a kid's photo
--
-- Admin for any kid; a Parent for their own kids. The parent must still hold
-- the Parent role, not only be linked to the kid. Works whether or not the
-- kid's registration is on a team, unlike register_kid(): a CSV-imported kid on
-- a team still needs a photo. A missing kid and someone else's kid get the same
-- error, so this cannot be used to probe which ids exist.
--
-- Error codes (the Server Action maps these):
--   42501  not an Admin, or not a Parent of this kid (or no such kid)
--   02000  the upload was not found
--   23505  another kid already uses this photo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_kid_photo(p_kid uuid, p_path text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    public.has_role('admin')
    or (
      public.has_role('parent')
      and exists (
        select 1 from kids k
         where k.id = p_kid
           and k.parent_user_id = auth.uid()
      )
    )
  ) then
    raise exception 'Kid not found'
      using errcode = '42501';
  end if;

  return public.attach_kid_photo(p_kid, p_path);
end $function$;

REVOKE ALL ON FUNCTION public.set_kid_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_kid_photo(uuid, text) TO authenticated;
