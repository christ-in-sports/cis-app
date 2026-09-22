-- CSV import staging + commit (ENG-5 PR 5 of N).
--
-- ENG-5 requires that the Admin review a parsed batch and explicitly commit
-- before anything is written to the database -- "nothing imports silently on
-- upload". That means the parsed, validated batch has to live somewhere between
-- upload and commit.
--
-- It lives here, in Postgres, rather than being round-tripped through the
-- client, for three reasons:
--
--   * Per-row addressability. Copying each kid's photo across from Google Drive
--     (a later PR, blocked on Drive API access) is slow enough that 300 rows
--     cannot be fetched inside one serverless invocation, so that work must be
--     chunked across requests and retried per row. A client-held array gives a
--     failed photo nowhere to land.
--   * Auditability. These are records about minors; who imported which kids, and
--     from which file, is worth keeping.
--   * Commit takes no payload. The data is already in the database, so
--     committing cannot be influenced by what the client sends back, and the
--     tie between a committed kid and its originating CSV line survives.
--
-- Nothing in `kids` or `registrations` is touched until `import_commit()` runs.

-- ---------------------------------------------------------------------------
-- import_batches -- one uploaded file
-- ---------------------------------------------------------------------------

CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,

  -- Pinned at upload rather than resolved at commit: a season rollover between
  -- review and commit must not silently retarget a batch the Admin reviewed.
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- pending    rows are still being written (upload in flight)
  -- ready      parsed and reviewable; the only state commit accepts
  -- committing claimed by an in-flight commit -- the idempotency guard
  -- committed  terminal
  -- failed     terminal; parsing or commit gave up
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'committing', 'committed', 'failed')),

  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,

  -- File-level header diagnostics, surfaced to the Admin instead of being
  -- silently dropped. `missing_required` being non-empty is why a batch fails.
  unmapped_headers text[] NOT NULL DEFAULT '{}',
  missing_required text[] NOT NULL DEFAULT '{}',

  error_message text,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  committed_at timestamp with time zone
);

CREATE INDEX import_batches_status_idx ON public.import_batches (status);
CREATE INDEX import_batches_created_idx ON public.import_batches (created_at DESC);

CREATE TRIGGER import_batches_touch
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- import_rows -- one CSV data row
-- ---------------------------------------------------------------------------

CREATE TABLE public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,

  -- Line number in the file the Admin opened: the header is line 1, so the
  -- first data row is line 2. Matches `parseRow`'s numbering in
  -- src/lib/import/csv/rows.ts so an error here names the line they can see.
  row_number integer NOT NULL,

  /** The original cells, verbatim, so the review screen can show what was typed. */
  raw jsonb NOT NULL,

  /** {kid, registration} once validated; null when the row has errors. */
  parsed jsonb,

  /** RowError[] from the shared validator -- row, column, field, message. */
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Self-reported consent status, for the Admin's review only. It never becomes
  -- consent_given_at, which stays null on import (docs/decisions.md 2026-09-22).
  consent_claim text,

  -- Reserved for the Drive photo-copy PR. Kept here so that work is a matter of
  -- filling these in per row rather than reshaping the table.
  photo_status text NOT NULL DEFAULT 'pending'
    CHECK (photo_status IN ('pending', 'skipped', 'copied', 'failed')),
  photo_path text,

  -- Set at parse time as a PREVIEW of what commit will do, and overwritten by
  -- commit with what it actually did. Parse-time matching is advisory only:
  -- import_commit() re-resolves against `kids` inside the transaction, because
  -- the roster can change between review and commit.
  matched_kid_id uuid REFERENCES public.kids(id) ON DELETE SET NULL,
  action text CHECK (action IN ('insert', 'update', 'error', 'skipped')),

  -- The earlier line in this same file carrying the same identity key, if any.
  --
  -- Not an error: the 2026-27 export contains 5 such pairs, which look like a
  -- parent submitting the form twice rather than two children. Commit processes
  -- rows in order, so the later row updates the kid the earlier one created --
  -- last answer wins. That is a reasonable default but a surprising one to
  -- discover after the fact, so it is recorded for the review screen to show.
  duplicate_of_row integer,

  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT import_rows_batch_row_key UNIQUE (batch_id, row_number)
);

CREATE INDEX import_rows_batch_idx ON public.import_rows (batch_id);

-- ---------------------------------------------------------------------------
-- RLS -- Admin only, read and write
--
-- ENG-5: "Only Admin has access to this feature, per the Role Permission Matrix
-- -- Program Team and other roles do not get CSV import." Unlike `kids`, there
-- is no broader read policy here: a staging batch is scratch space for the
-- Admin running the import, and it holds the same sensitive minor data.
-- ---------------------------------------------------------------------------

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage import batches" ON public.import_batches
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE POLICY "admin manage import rows" ON public.import_rows
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- import_commit() -- promote a reviewed batch into kids + registrations
--
-- One function call is one statement is one transaction, which is what makes
-- this atomic: supabase-js has no multi-statement transaction API, so doing
-- this as a sequence of client-side inserts could leave a half-imported roster
-- behind if the connection dropped midway.
--
-- SECURITY DEFINER to write `kids` and `registrations` without depending on the
-- caller's RLS -- so it checks has_role('admin') itself, first. A SECURITY
-- DEFINER function that skipped that check would be a way around the policies.
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

  -- Claim the batch. The WHERE clause is the idempotency guard: a second call
  -- (a double-clicked button, a retried request) finds status already
  -- 'committing' or 'committed', matches no row, and raises instead of
  -- importing everything twice. The row lock serialises concurrent callers, so
  -- exactly one wins. A disabled button in the UI is a convenience, never this.
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

    -- Returning-kid matching: first name + last name + DOB, case-insensitive
    -- and whitespace-trimmed (project_spec.md 2.5). Mirrors both
    -- `kids_identity_idx` and identityKey() in src/lib/import/csv/rows.ts;
    -- all three must agree, which the DB tests assert.
    --
    -- Resolved here rather than trusting the matched_kid_id written at parse
    -- time, because a kid may have been created in between.
    -- array_agg rather than min(): Postgres has no min(uuid). The element is
    -- only read when the count is exactly 1, but the ordering keeps it
    -- deterministic regardless.
    select count(*), (array_agg(k.id order by k.id))[1]
      into v_match_count, v_kid_id
      from kids k
     where lower(trim(k.first_name)) = lower(trim(v_first))
       and lower(trim(k.last_name))  = lower(trim(v_last))
       and k.dob = v_dob;

    -- The identity key is deliberately non-unique, so more than one match is a
    -- real possibility and NOT something to resolve by picking one -- that
    -- would silently overwrite the wrong child's medical and contact details.
    -- The row is skipped and reported; the rest of the batch still commits,
    -- because one ambiguous row should not strand 250 good ones.
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
        first_name, last_name, dob, gender, photo_path,
        email, phone, allergies,
        home_address, emergency_contact_name, emergency_contact_phone,
        guardian_name, guardian_phone, guardian_email, skill_tags
      )
      values (
        v_first,
        v_last,
        v_dob,
        v_row.parsed -> 'kid' ->> 'gender',
        v_row.photo_path,
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
      -- A returning kid: refresh from the newer form answer.
      --
      -- Required fields overwrite outright. Optional ones (email, phone,
      -- allergies, photo) fall back to what is already stored, because a blank
      -- cell means "not answered", not "delete this". That matters most for
      -- allergies: dropping a recorded allergy because a parent left the box
      -- empty is the more dangerous of the two failure modes.
      --
      -- parent_user_id is untouched: it is established by account linking, not
      -- by a spreadsheet.
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
             email      = coalesce(v_row.parsed -> 'kid' ->> 'email', kids.email),
             phone      = coalesce(v_row.parsed -> 'kid' ->> 'phone', kids.phone),
             allergies  = coalesce(v_row.parsed -> 'kid' ->> 'allergies', kids.allergies),
             photo_path = coalesce(v_row.photo_path, kids.photo_path)
       where id = v_kid_id;

      v_updated := v_updated + 1;

      update import_rows
         set action = 'update', matched_kid_id = v_kid_id
       where id = v_row.id;
    end if;

    -- One registration per kid per season. Re-importing a corrected file
    -- updates the season's registration rather than failing on the unique
    -- constraint.
    --
    -- consent_given_at and consent_by_user_id are never written here: the CSV's
    -- consent answer refers to a paper form handed in months earlier, so it is
    -- not evidence of consent given now (docs/decisions.md 2026-09-22). Any
    -- consent already recorded by the parent form is left intact.
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

-- PostgREST exposes every function in `public`; be explicit about who may call
-- this one. The has_role('admin') check above is the real gate -- this just
-- stops an anonymous request reaching the function body at all.
REVOKE ALL ON FUNCTION public.import_commit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_commit(uuid) TO authenticated;
