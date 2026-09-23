/**
 * `/admin/imports` -- the roster CSV import screen.
 *
 * One route, three states (empty / review / done), per the design in
 * `design/reference/CSV Import Review.dc.html`. Which state shows is decided by
 * the `batch` search param rather than by component state, so a reload during
 * review returns to the same batch instead of losing it.
 *
 * Admin-only. Unlike `/registrations`, which fetches a role flag and passes it
 * down without acting on it, this redirects: there is nothing on this screen a
 * non-Admin may see. RLS is still the real boundary -- `import_batches` and
 * `import_rows` are Admin-only, so a non-Admin who reached this page anyway
 * would simply find no batch.
 */

import { redirect } from 'next/navigation';

import { checkAdmin } from '@/lib/auth/admin';
import ImportsClient, { type ReviewBatch, type ReviewRow } from './imports-client';

export const dynamic = 'force-dynamic';

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) redirect('/login?redirect=/admin/imports');
  if (!isAdmin) redirect('/');

  const { batch: batchId } = await searchParams;

  if (!batchId) {
    return <ImportsClient key="empty" batch={null} rows={[]} />;
  }

  const { data: batch } = await supabase
    .from('import_batches')
    .select(
      'id, file_name, status, total_rows, valid_rows, error_rows, unmapped_headers, seasons(name)',
    )
    .eq('id', batchId)
    .maybeSingle();

  // A batch id that does not resolve (stale link, another Admin's batch removed)
  // falls back to the empty state rather than erroring -- there is nothing the
  // Admin could do with the error, and starting again is the only way forward.
  //
  // Only `ready` (still to review) and `committed` (show what happened) have a
  // screen. Anything else -- a batch abandoned mid-upload, or one that failed
  // parsing -- has nothing useful to show, so start fresh rather than render a
  // half-built batch.
  if (!batch || (batch.status !== 'ready' && batch.status !== 'committed')) {
    return <ImportsClient key="empty" batch={null} rows={[]} />;
  }

  const { data: rows } = await supabase
    .from('import_rows')
    .select(
      'row_number, display_name, parsed, errors, action, duplicate_of_row, consent_claim',
    )
    .eq('batch_id', batchId)
    .order('row_number');

  const season = batch.seasons as { name: string } | { name: string }[] | null;
  const seasonName = Array.isArray(season) ? (season[0]?.name ?? null) : (season?.name ?? null);

  return (
    <ImportsClient
      key={batch.id}
      batch={{
        id: batch.id,
        fileName: batch.file_name,
        status: batch.status,
        seasonName,
        totalRows: batch.total_rows,
        validRows: batch.valid_rows,
        errorRows: batch.error_rows,
        unmappedHeaders: batch.unmapped_headers ?? [],
      } satisfies ReviewBatch}
      rows={(rows ?? []).map(
        (row): ReviewRow => ({
          rowNumber: row.row_number,
          displayName: row.display_name,
          grade:
            (row.parsed as { registration?: { grade?: number } } | null)?.registration?.grade ??
            null,
          errors: (row.errors ?? []) as ReviewRow['errors'],
          action: row.action as ReviewRow['action'],
          duplicateOfRow: row.duplicate_of_row,
          consentClaim: row.consent_claim as ReviewRow['consentClaim'],
        }),
      )}
    />
  );
}
