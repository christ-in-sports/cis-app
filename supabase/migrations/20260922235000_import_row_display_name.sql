-- A human-readable name for every staged row (ENG-5 PR 6).
--
-- The review screen shows a name on every line, including lines that failed
-- validation -- a row an Admin has to go and fix is exactly the one they need to
-- recognise. But `parsed` is null for those rows by design, and `raw` is a
-- positional array of cells whose meaning depends on the header mapping, which
-- is not stored anywhere.
--
-- Rather than persist the mapping and resolve names in the browser, the name is
-- resolved once at parse time (where the mapping already exists) and stored.
-- It is display data only: nothing reads it back, and `import_commit()` writes
-- the roster from `parsed`, never from this.
--
-- Null where the name cells themselves are missing or blank, which the review
-- screen shows as "Name missing".

ALTER TABLE public.import_rows ADD COLUMN display_name text;

COMMENT ON COLUMN public.import_rows.display_name IS
  'Best-effort name for the review screen, resolved from the raw cells at parse '
  'time so that rows which failed validation are still identifiable. Display '
  'only -- import_commit() never reads it.';
