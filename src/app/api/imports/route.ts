/**
 * `POST /api/imports` -- upload a roster CSV, parse and validate it server-side,
 * and stage the result for review.
 *
 * This writes nothing to `kids` or `registrations`. It produces an
 * `import_batches` row plus one `import_rows` row per line in the file, which
 * the Admin reviews before calling the commit action. ENG-5 is explicit that
 * nothing imports silently on upload.
 *
 * A route handler rather than a Server Action, which `project_spec.md` §2.5
 * otherwise prefers for mutations. Two reasons, both about this being a file
 * upload:
 *
 *   * Server Actions cap the request body at 1MB, and the only way to raise it
 *     is `experimental.serverActions.bodySizeLimit` in next.config -- a global
 *     setting that would weaken every action in the app to accommodate this one
 *     endpoint.
 *   * `maxDuration` is per-route here, but only per-*page* for Server Actions,
 *     so a slow upload cannot be given headroom without giving it to every
 *     action on the page too.
 *
 * The commit step has neither constraint -- it takes a single batch id -- and is
 * a Server Action, in `src/app/admin/imports/actions.ts`.
 */

import { NextResponse } from 'next/server';
import Papa from 'papaparse';

import { checkAdmin } from '@/lib/auth/admin';
import { mapHeaders, FIELD_LABEL } from '@/lib/import/csv/columns';
import { parseRows } from '@/lib/import/csv/rows';
import { resolveImportRows, countRows, type KidIdentity } from '@/lib/import/batch';

/** Generous next to a ~300-kid program, but bounded: this parses in memory. */
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

export const maxDuration = 60;

export async function POST(request: Request) {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'CSV import is available to Admins only.' },
      { status: 403 },
    );
  }

  let file: File;
  try {
    const form = await request.formData();
    const upload = form.get('file');

    if (!(upload instanceof File)) {
      return NextResponse.json(
        { error: 'Attach a CSV file in the "file" field.' },
        { status: 400 },
      );
    }
    file = upload;
  } catch {
    return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is larger than ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  // Registrations are per season and `registrations.season_id` is NOT NULL, so
  // there is nothing to import into until a season exists. Pinned onto the batch
  // now so a rollover between review and commit cannot retarget it.
  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .maybeSingle();

  if (seasonError) {
    return NextResponse.json({ error: seasonError.message }, { status: 500 });
  }
  if (!season) {
    return NextResponse.json(
      { error: 'There is no current season to import into. Start a season first.' },
      { status: 409 },
    );
  }

  const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });

  // A row that is entirely empty cells survives `skipEmptyLines`, and a trailing
  // one is common in exported spreadsheets.
  const lines = parsed.data.filter((cells) =>
    cells.some((cell) => String(cell ?? '').trim() !== ''),
  );

  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'That file needs a header row and at least one registration.' },
      { status: 400 },
    );
  }

  const [header, ...dataRows] = lines;

  if (dataRows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `That file has ${dataRows.length} rows; the limit is ${MAX_ROWS}.` },
      { status: 413 },
    );
  }

  const mapping = mapHeaders(header);

  // A required column missing is a problem with the file, not with any one row,
  // so it fails the whole upload. The batch is still recorded: these are files
  // about minors, and an audit trail of what was attempted is worth keeping.
  if (mapping.missingRequired.length > 0) {
    const missingLabels = mapping.missingRequired.map((field) => FIELD_LABEL[field]);

    const { data: failedBatch } = await supabase
      .from('import_batches')
      .insert({
        file_name: file.name,
        season_id: season.id,
        uploaded_by: userId,
        status: 'failed',
        total_rows: dataRows.length,
        unmapped_headers: mapping.unmapped,
        missing_required: mapping.missingRequired,
        error_message: `Missing required columns: ${missingLabels.join(', ')}`,
      })
      .select('id')
      .single();

    return NextResponse.json(
      {
        error: `That file is missing required columns: ${missingLabels.join(', ')}.`,
        batchId: failedBatch?.id ?? null,
        missingRequired: mapping.missingRequired,
        unmappedHeaders: mapping.unmapped,
      },
      { status: 422 },
    );
  }

  // The whole roster, to resolve returning kids. At a few hundred rows this is
  // one small query; matching in the database per row would be many.
  const { data: existingKids, error: kidsError } = await supabase
    .from('kids')
    .select('id, first_name, last_name, dob');

  if (kidsError) {
    return NextResponse.json({ error: kidsError.message }, { status: 500 });
  }

  const rows = resolveImportRows(
    parseRows(dataRows, mapping),
    dataRows,
    (existingKids ?? []) as KidIdentity[],
    mapping,
  );
  const counts = countRows(rows);

  // Created `pending` and flipped to `ready` only once every row is written, so
  // a batch that fails halfway through can never be committed.
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      file_name: file.name,
      season_id: season.id,
      uploaded_by: userId,
      status: 'pending',
      total_rows: counts.total,
      valid_rows: counts.valid,
      error_rows: counts.errored,
      unmapped_headers: mapping.unmapped,
      missing_required: [],
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message ?? 'Could not start the import.' },
      { status: 500 },
    );
  }

  const { error: rowsError } = await supabase.from('import_rows').insert(
    rows.map((row) => ({
      batch_id: batch.id,
      row_number: row.row_number,
      raw: row.raw,
      parsed: row.parsed,
      errors: row.errors,
      consent_claim: row.consent_claim,
      matched_kid_id: row.matched_kid_id,
      action: row.action,
      duplicate_of_row: row.duplicate_of_row,
      display_name: row.display_name,
    })),
  );

  if (rowsError) {
    await supabase
      .from('import_batches')
      .update({ status: 'failed', error_message: rowsError.message })
      .eq('id', batch.id);

    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const { error: readyError } = await supabase
    .from('import_batches')
    .update({ status: 'ready' })
    .eq('id', batch.id);

  if (readyError) {
    return NextResponse.json({ error: readyError.message }, { status: 500 });
  }

  return NextResponse.json({
    batchId: batch.id,
    season: { id: season.id, name: season.name },
    fileName: file.name,
    counts: {
      total: counts.total,
      valid: counts.valid,
      errored: counts.errored,
      toCreate: rows.filter((row) => row.action === 'insert').length,
      toUpdate: rows.filter((row) => row.action === 'update').length,
      duplicatesInFile: rows.filter((row) => row.duplicate_of_row !== null).length,
    },
    unmappedHeaders: mapping.unmapped,
  });
}
