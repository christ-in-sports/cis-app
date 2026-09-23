'use client';

/**
 * The three states of the roster import screen, built from
 * `design/reference/CSV Import Review.dc.html`.
 *
 * Status is plain text in its own column -- no colour, no chip. That is
 * deliberate: the design system gives each of its three colours exactly one job
 * (orange = primary action, ember = sport, sage = spiritual), and an import row
 * is none of those. Rather than invent a fourth colour role, problems earn
 * their emphasis from type weight, the summary count, and the filter.
 * `DESIGN_SYSTEM.md` §3 also rules out a status dot, which is the usual
 * shortcut here.
 */

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { PageShell } from '@/components/cis/page-shell';
import { commitImportBatch } from './actions';

export interface ReviewRow {
  rowNumber: number;
  displayName: string | null;
  grade: number | null;
  errors: Array<{ row: number; column: string | null; message: string }>;
  action: 'insert' | 'update' | 'error';
  duplicateOfRow: number | null;
  consentClaim: 'claimed' | 'not-claimed' | 'inconsistent' | 'unknown';
}

export interface ReviewBatch {
  id: string;
  fileName: string;
  status: string;
  seasonName: string | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  unmappedHeaders: string[];
}

/** The status cell's text. Problems lead with the reason; it is what gets fixed. */
function statusText(row: ReviewRow): string {
  if (row.action === 'error') return 'Problem';
  if (row.duplicateOfRow !== null) return `Returning — also on line ${row.duplicateOfRow}`;
  return row.action === 'update' ? 'Returning' : 'New';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell className="max-w-[460px]">
      <h1 className="font-cis-display text-cis-xl font-normal leading-[1.1]">Roster import</h1>
      {children}
    </PageShell>
  );
}

export default function ImportsClient({
  batch,
  rows,
}: {
  batch: ReviewBatch | null;
  rows: ReviewRow[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consentOwed = useMemo(
    () => rows.filter((r) => r.action !== 'error' && r.consentClaim !== 'claimed').length,
    [rows],
  );
  const duplicates = useMemo(
    () => rows.filter((r) => r.duplicateOfRow !== null).length,
    [rows],
  );
  // Only rows matching a kid already on the roster. A row that merely repeats an
  // earlier line in this same file is also an "update", but counting it here
  // would report it twice -- it already has its own line in the summary, and
  // calling it a returning kid is plainly wrong when the roster is empty.
  const returning = useMemo(
    () => rows.filter((r) => r.action === 'update' && r.duplicateOfRow === null).length,
    [rows],
  );
  const problemLines = useMemo(
    () => rows.filter((r) => r.action === 'error').map((r) => r.rowNumber),
    [rows],
  );

  const visibleRows = problemsOnly ? rows.filter((r) => r.action === 'error') : rows;

  async function upload(file: File) {
    setError(null);
    setUploading(true);

    const body = new FormData();
    body.append('file', file);

    const res = await fetch('/api/imports', { method: 'POST', body });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';

    if (!res.ok) {
      setError(json.error ?? 'Could not read that file.');
      return;
    }

    router.push(`/admin/imports?batch=${json.batchId}`);
    router.refresh();
  }

  async function commit() {
    if (!batch) return;
    setError(null);
    setCommitting(true);

    const result = await commitImportBatch(batch.id);
    setCommitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not complete the import.');
      return;
    }

    // Nothing to store: the action revalidates, the batch comes back
    // `committed`, and the done state below renders from it.
    router.refresh();
  }

  // What the commit actually did, read back from the rows it wrote. Derived
  // rather than remembered so a reload of this URL still shows the outcome.
  const committed = batch?.status === 'committed';
  const createdCount = rows.filter((r) => r.action === 'insert').length;
  const updatedCount = rows.filter((r) => r.action === 'update').length;

  function startOver() {
    // Navigation is the only thing that changes which state renders -- there is
    // no local flag to clear first. An earlier version cleared a `done` flag
    // here and flashed the old review table for a frame, because the `batch`
    // prop still belonged to the previous server render and the component fell
    // through to the review branch. Deriving everything from `batch` means the
    // current tree keeps rendering until the new one is ready to replace it.
    setProblemsOnly(false);
    router.push('/admin/imports');
    router.refresh();
  }

  // ---------------------------------------------------------------- 3 · Done
  if (batch && committed) {
    return (
      <Shell>
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
          <SheetHeading className="text-cis-xl">Roster imported</SheetHeading>
          <div className="text-cis-sm font-semibold text-cis-ink-muted">
            {batch?.fileName}
            {batch?.seasonName ? ` · ${batch.seasonName}` : ''}
          </div>
          <SheetRule />
          <div className="font-cis-display text-cis-display-md leading-[1.1]">
            {createdCount} created, {updatedCount} updated
          </div>
          <div className="flex flex-col gap-cis-1 text-cis-base leading-[1.5]">
            {problemLines.length > 0 && (
              <p className="m-0">
                {problemLines.length}{' '}
                {problemLines.length === 1 ? 'row was' : 'rows were'} skipped:{' '}
                {problemLines.length <= 12
                  ? `line${problemLines.length === 1 ? '' : 's'} ${problemLines.join(', ')}`
                  : `including lines ${problemLines.slice(0, 12).join(', ')}`}
                . Fix them in the spreadsheet and import it again.
              </p>
            )}
            {consentOwed > 0 && <p className="m-0">{consentOwed} kids still owe a consent form.</p>}
          </div>
          <div className="my-cis-1 border-t-2 border-dashed border-cis-rule-dash" />
          <SecondaryButton block onClick={startOver}>
            Import another file
          </SecondaryButton>
        </Sheet>
      </Shell>
    );
  }

  // -------------------------------------------------------------- 2 · Review
  if (batch && !committed) {
    return (
      <Shell>
        <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-5 pt-cis-6">
          <div className="flex flex-col gap-1">
            <SheetHeading>{batch.fileName}</SheetHeading>
            <div className="text-cis-sm font-semibold text-cis-ink-muted">
              {batch.seasonName ? `Into ${batch.seasonName}` : 'No season set'}
            </div>
          </div>
          <SheetRule />
          <div className="text-cis-md font-extrabold leading-[1.4]">
            {batch.totalRows} rows · {batch.validRows} ready · {batch.errorRows} problems ·{' '}
            {returning} returning kids
          </div>
          <div className="flex flex-col gap-1 text-cis-base leading-[1.45]">
            {consentOwed > 0 && <p className="m-0">{consentOwed} still owe a consent form</p>}
            {duplicates > 0 && (
              <p className="m-0">
                {duplicates === 1
                  ? '1 row repeats an earlier line — the later one wins'
                  : `${duplicates} rows repeat an earlier line — the later one wins`}
              </p>
            )}
            {batch.unmappedHeaders.length > 0 && (
              <p className="m-0">
                {batch.unmappedHeaders.length === 1
                  ? '1 column was not recognised and will be ignored'
                  : `${batch.unmappedHeaders.length} columns were not recognised and will be ignored`}
              </p>
            )}
          </div>
        </Sheet>

        <Sheet className="flex flex-col gap-cis-3 px-cis-4 pb-cis-4 pt-cis-5">
          <div className="flex items-center justify-between gap-cis-3">
            <SheetHeading>Rows</SheetHeading>
            <button
              type="button"
              aria-pressed={problemsOnly}
              onClick={() => setProblemsOnly((v) => !v)}
              disabled={batch.errorRows === 0}
              className={`min-h-9 rounded-cis-chip border-2 border-cis-ink px-3 py-[7px] text-cis-sm font-bold disabled:opacity-40 ${
                problemsOnly ? 'bg-cis-ink text-cis-paper-light' : 'bg-transparent text-cis-ink'
              }`}
            >
              Show only problems
            </button>
          </div>

          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[34px]" />
              <col />
              <col className="w-[44px]" />
              <col className="w-[92px]" />
            </colgroup>
            <thead>
              <tr className="border-b-4 border-cis-ink-dark">
                <th scope="col" className="pb-2 text-left text-cis-sm font-bold text-cis-ink-muted">
                  Line
                </th>
                <th scope="col" className="pb-2 text-left text-cis-sm font-bold text-cis-ink-muted">
                  Name
                </th>
                <th
                  scope="col"
                  className="pb-2 text-right text-cis-sm font-bold text-cis-ink-muted"
                >
                  Grade
                </th>
                <th
                  scope="col"
                  className="pb-2 pl-3 text-left text-cis-sm font-bold text-cis-ink-muted"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-cis-rule align-top">
                  <td className="py-[10px] text-cis-sm font-extrabold tabular-nums text-cis-ink-muted">
                    {row.rowNumber}
                  </td>
                  <td className="py-[10px] pr-[6px]">
                    <div className="text-cis-base font-bold leading-[1.3]">
                      {row.displayName ?? 'Name missing'}
                    </div>
                    {row.errors.length > 0 && (
                      <div className="mt-[2px] text-cis-xs font-semibold leading-[1.4] text-cis-ink-muted">
                        {row.errors
                          .map((e) => (e.column ? `${e.message} (column "${e.column}")` : e.message))
                          .join('; ')}
                      </div>
                    )}
                  </td>
                  <td className="py-[10px] text-right text-cis-base font-extrabold tabular-nums">
                    {row.grade ?? '—'}
                  </td>
                  <td
                    className={`py-[10px] pl-3 text-cis-sm leading-[1.35] ${
                      row.action === 'error' ? 'font-extrabold' : 'font-semibold'
                    }`}
                  >
                    {statusText(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibleRows.length === 0 && (
            <p className="m-0 py-cis-4 text-center text-cis-base text-cis-ink-muted">
              No problems in this file.
            </p>
          )}
        </Sheet>

        {error && (
          <p className="m-0 text-cis-base font-bold leading-[1.45]" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-cis-2">
          <SecondaryButton className="flex-none px-5" onClick={startOver} disabled={committing}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            className="flex-1"
            onClick={commit}
            disabled={committing || batch.validRows === 0}
          >
            {committing ? 'Importing…' : `Import ${batch.validRows} rows`}
          </PrimaryButton>
        </div>
      </Shell>
    );
  }

  // --------------------------------------------------------------- 1 · Empty
  return (
    <Shell>
      <Sheet className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
        <SheetHeading className="text-cis-xl">Import this year&apos;s roster</SheetHeading>
        <p className="m-0 text-cis-base leading-[1.5]">
          Choose the roster CSV for the current season. You&apos;ll see every row before anything
          is saved.
        </p>
        {error && (
          <p className="m-0 text-cis-base font-bold leading-[1.45]" role="alert">
            {error}
          </p>
        )}
        <label className="mt-cis-1 flex">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <span
            className={`flex min-h-cis-tap-primary flex-1 cursor-pointer items-center justify-center rounded-cis-pill bg-cis-orange text-cis-lg font-extrabold text-cis-ink-dark shadow-cis-press ${
              uploading ? 'opacity-60' : 'hover:bg-cis-orange-hover'
            }`}
          >
            {uploading ? 'Reading…' : 'Choose CSV file'}
          </span>
        </label>
      </Sheet>
    </Shell>
  );
}
