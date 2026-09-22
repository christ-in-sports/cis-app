/**
 * Turns the output of the CSV parser into the rows staged in `import_rows`.
 *
 * This is the layer between parsing (`./csv/`, which knows about spreadsheets)
 * and committing (`import_commit()` in SQL, which knows about the database).
 * Its job is to work out, for each parsed row, what committing it *would* do --
 * create a kid, update a returning one, or nothing because the row has errors --
 * so the Admin can see the consequences before agreeing to them.
 *
 * Everything here is a preview. `import_commit()` re-resolves every match inside
 * its transaction, because the roster can change between review and commit. The
 * two must agree on what "the same kid" means, which is why both go through the
 * one identity key defined in `./csv/rows.ts`.
 */

import { identityKey, type ParsedRow } from './csv/rows';

/** The subset of a `kids` row needed to match against an incoming CSV row. */
export interface KidIdentity {
  id: string;
  first_name: string;
  last_name: string;
  dob: string;
}

/** What committing this row is expected to do. */
export type ImportAction = 'insert' | 'update' | 'error';

/** One row, ready to be written to `import_rows`. */
export interface ImportRowInput {
  row_number: number;
  raw: string[];
  parsed: ParsedRow['data'];
  errors: ParsedRow['errors'];
  consent_claim: ParsedRow['consentClaim'];
  matched_kid_id: string | null;
  action: ImportAction;
  duplicate_of_row: number | null;
}

/**
 * Indexes the existing roster by identity key.
 *
 * Values are arrays because the key is deliberately not unique (see
 * `kids_identity_idx`): a key with more than one kid behind it is ambiguous and
 * must never be resolved by picking one.
 */
export function indexKidsByIdentity(kids: KidIdentity[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const kid of kids) {
    const key = identityKey(kid);
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, [kid.id]);
    } else {
      existing.push(kid.id);
    }
  }

  return index;
}

/** The error appended when a row matches more than one existing kid. */
function ambiguousMatchError(rowNumber: number, matches: number) {
  return {
    row: rowNumber,
    column: null,
    field: null,
    message:
      `Matches ${matches} existing kids with the same name and date of birth; ` +
      `resolve before importing`,
  };
}

/**
 * Resolves each parsed row against the existing roster and against the rows
 * before it in the same file.
 *
 * Three outcomes, and the ordering of the checks matters:
 *
 *   1. The row already failed validation -- nothing to match, stays an error.
 *   2. It matches more than one existing kid -- an error, because committing it
 *      would overwrite one of two real children's medical and contact details
 *      chosen essentially at random.
 *   3. It matches exactly one (or one created by an earlier row in this file) --
 *      an update. Otherwise, an insert.
 *
 * In-file duplicates are treated as updates rather than errors because the real
 * export shows them to be repeat submissions of the same child, not collisions
 * between different ones. The earlier line is recorded so the review screen can
 * say so, since "last answer wins" is otherwise invisible.
 */
export function resolveImportRows(
  parsedRows: ParsedRow[],
  rawRows: string[][],
  existingKids: KidIdentity[],
): ImportRowInput[] {
  const byIdentity = indexKidsByIdentity(existingKids);

  // Identity keys seen earlier in this same file -> the line that introduced
  // them. A later row sharing a key resolves to whatever that row resolved to.
  const seenInFile = new Map<string, number>();

  return parsedRows.map((row, index): ImportRowInput => {
    const raw = rawRows[index] ?? [];

    if (row.data === null) {
      return {
        row_number: row.rowNumber,
        raw,
        parsed: null,
        errors: row.errors,
        consent_claim: row.consentClaim,
        matched_kid_id: null,
        action: 'error',
        duplicate_of_row: null,
      };
    }

    const key = identityKey(row.data.kid);
    const matches = byIdentity.get(key) ?? [];
    const duplicateOfRow = seenInFile.get(key) ?? null;

    if (!seenInFile.has(key)) seenInFile.set(key, row.rowNumber);

    if (matches.length > 1) {
      return {
        row_number: row.rowNumber,
        raw,
        // Deliberately dropped: `import_commit()` only processes rows whose
        // `parsed` is non-null, so clearing it is what keeps an ambiguous row
        // out of the import even if the errors array were ignored.
        parsed: null,
        errors: [...row.errors, ambiguousMatchError(row.rowNumber, matches.length)],
        consent_claim: row.consentClaim,
        matched_kid_id: null,
        action: 'error',
        duplicate_of_row: duplicateOfRow,
      };
    }

    // A row duplicating an earlier line will, at commit time, find the kid that
    // line created -- so it is an update even when the roster has no match yet.
    const matchedKidId = matches[0] ?? null;
    const isUpdate = matchedKidId !== null || duplicateOfRow !== null;

    return {
      row_number: row.rowNumber,
      raw,
      parsed: row.data,
      errors: row.errors,
      consent_claim: row.consentClaim,
      matched_kid_id: matchedKidId,
      action: isUpdate ? 'update' : 'insert',
      duplicate_of_row: duplicateOfRow,
    };
  });
}

export interface BatchCounts {
  total: number;
  valid: number;
  errored: number;
}

/** Headline counts for the review screen and the `import_batches` row. */
export function countRows(rows: ImportRowInput[]): BatchCounts {
  const errored = rows.filter((row) => row.action === 'error').length;

  return {
    total: rows.length,
    valid: rows.length - errored,
    errored,
  };
}
