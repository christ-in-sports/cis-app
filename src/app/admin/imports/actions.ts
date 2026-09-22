'use server';

/**
 * Commits a reviewed import batch.
 *
 * This is the repo's first Server Action. `project_spec.md` §2.5 prefers them
 * over a client fetch plus an API route for mutations, and commit is where that
 * preference costs nothing: the payload is a single batch id, so neither the
 * 1MB body limit nor the per-page-only `maxDuration` that pushed the *upload*
 * into a route handler applies here. It also gets `revalidatePath` directly,
 * rather than needing the client to re-fetch after a POST.
 *
 * The work itself is one `import_commit()` call. Everything that matters --
 * the Admin check, the already-committed guard, matching returning kids, and
 * writing both tables atomically -- happens inside that function, in a single
 * transaction. This wrapper exists to authenticate the caller early enough to
 * give a useful message, and to turn Postgres errors into readable ones.
 */

import { revalidatePath } from 'next/cache';

import { checkAdmin } from '@/lib/auth/admin';

export interface CommitResult {
  ok: boolean;
  error?: string;
  summary?: {
    inserted: number;
    updated: number;
    ambiguous: number;
    skippedWithErrors: number;
  };
}

/** Postgres error codes `import_commit()` raises deliberately. */
const NOT_READY = '55000';
const FORBIDDEN = '42501';

export async function commitImportBatch(batchId: string): Promise<CommitResult> {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!isAdmin) {
    return { ok: false, error: 'CSV import is available to Admins only.' };
  }

  const { data, error } = await supabase.rpc('import_commit', { p_batch_id: batchId });

  if (error) {
    // A repeat call is the expected way to hit this -- a double-clicked button,
    // or a retried request -- so it reads as a status rather than a failure.
    // The guard lives in the database, not in a disabled button.
    if (error.code === NOT_READY) {
      return {
        ok: false,
        error: 'This import has already been committed, or is no longer ready to commit.',
      };
    }
    if (error.code === FORBIDDEN) {
      return { ok: false, error: 'CSV import is available to Admins only.' };
    }

    console.error('import_commit failed:', error.message);
    return { ok: false, error: 'Could not complete the import.' };
  }

  const summary = data as {
    inserted: number;
    updated: number;
    ambiguous: number;
    skipped_with_errors: number;
  };

  revalidatePath('/admin/imports');
  revalidatePath('/registrations');

  return {
    ok: true,
    summary: {
      inserted: summary.inserted,
      updated: summary.updated,
      ambiguous: summary.ambiguous,
      skippedWithErrors: summary.skipped_with_errors,
    },
  };
}
