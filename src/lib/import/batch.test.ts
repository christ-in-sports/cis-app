/**
 * Covers the returning-kid matching preview, which is the part of the importer
 * most likely to do quiet damage: getting it wrong either duplicates a child
 * across seasons or overwrites the wrong child's medical and contact details.
 *
 * The equivalent matching inside `import_commit()` is covered by
 * supabase/tests/imports.test.ts, which also asserts the two agree.
 */

import {
  resolveImportRows,
  indexKidsByIdentity,
  countRows,
  type KidIdentity,
} from './batch';
import type { ParsedRow } from './csv/rows';
import type { KidRegistrationInput } from '@/lib/validation/kid';

function kidRegistration(
  overrides: { first?: string; last?: string; dob?: string } = {},
): KidRegistrationInput {
  return {
    kid: {
      first_name: overrides.first ?? 'Mina',
      last_name: overrides.last ?? 'Guirguis',
      dob: overrides.dob ?? '2014-03-02',
      gender: 'male',
      photo_path: null,
      email: null,
      phone: null,
      allergies: null,
      home_address: '1 Church Way, Hayward, CA',
      emergency_contact_name: 'Mariam Guirguis',
      emergency_contact_phone: '(510) 555-0111',
      guardian_name: 'Mariam Guirguis',
      guardian_phone: '(510) 555-0111',
      guardian_email: 'mariam@example.com',
      skill_tags: [],
    },
    registration: {
      grade: 6,
      division: 'juniors',
      tshirt_size: 'YM',
      top_sports: null,
    },
  };
}

function validRow(rowNumber: number, overrides = {}): ParsedRow {
  return {
    rowNumber,
    data: kidRegistration(overrides),
    errors: [],
    consentClaim: 'unknown',
  };
}

function erroredRow(rowNumber: number): ParsedRow {
  return {
    rowNumber,
    data: null,
    errors: [
      { row: rowNumber, column: 'Grade', field: 'grade', message: 'Grade is required' },
    ],
    consentClaim: 'unknown',
  };
}

function existingKid(
  id: string,
  overrides: { first?: string; last?: string; dob?: string } = {},
): KidIdentity {
  return {
    id,
    first_name: overrides.first ?? 'Mina',
    last_name: overrides.last ?? 'Guirguis',
    dob: overrides.dob ?? '2014-03-02',
  };
}

describe('indexKidsByIdentity', () => {
  it('normalises case and surrounding whitespace', () => {
    const index = indexKidsByIdentity([
      existingKid('kid-1', { first: '  MINA ', last: 'Guirguis  ' }),
    ]);

    expect(index.get('mina|guirguis|2014-03-02')).toEqual(['kid-1']);
  });

  it('keeps every kid sharing an identity key rather than collapsing them', () => {
    const index = indexKidsByIdentity([existingKid('kid-1'), existingKid('kid-2')]);

    expect(index.get('mina|guirguis|2014-03-02')).toEqual(['kid-1', 'kid-2']);
  });
});

describe('resolveImportRows -- matching against the existing roster', () => {
  it('treats a kid who is not on the roster as an insert', () => {
    const [row] = resolveImportRows([validRow(2)], [['Mina']], []);

    expect(row.action).toBe('insert');
    expect(row.matched_kid_id).toBeNull();
  });

  it('matches a returning kid rather than creating a second record', () => {
    const [row] = resolveImportRows([validRow(2)], [['Mina']], [existingKid('kid-1')]);

    expect(row.action).toBe('update');
    expect(row.matched_kid_id).toBe('kid-1');
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const [row] = resolveImportRows(
      [validRow(2, { first: '  mina', last: 'GUIRGUIS ' })],
      [['mina']],
      [existingKid('kid-1')],
    );

    expect(row.action).toBe('update');
    expect(row.matched_kid_id).toBe('kid-1');
  });

  it('does not match a different birthday, since that is a different child', () => {
    const [row] = resolveImportRows(
      [validRow(2, { dob: '2015-03-02' })],
      [['Mina']],
      [existingKid('kid-1')],
    );

    expect(row.action).toBe('insert');
    expect(row.matched_kid_id).toBeNull();
  });

  it('does not match twins, who share a surname and birthday but not a first name', () => {
    const [row] = resolveImportRows(
      [validRow(2, { first: 'Marina' })],
      [['Marina']],
      [existingKid('kid-1', { first: 'Mina' })],
    );

    expect(row.action).toBe('insert');
  });
});

describe('resolveImportRows -- ambiguity is never resolved by guessing', () => {
  it('errors a row matching more than one kid instead of picking one', () => {
    const [row] = resolveImportRows(
      [validRow(2)],
      [['Mina']],
      [existingKid('kid-1'), existingKid('kid-2')],
    );

    expect(row.action).toBe('error');
    expect(row.matched_kid_id).toBeNull();
    expect(row.errors.at(-1)?.message).toMatch(/Matches 2 existing kids/);
  });

  it('withholds the parsed payload so an ambiguous row cannot be committed', () => {
    // import_commit() only processes rows whose `parsed` is non-null, so this
    // is what actually keeps the row out of the import.
    const [row] = resolveImportRows(
      [validRow(2)],
      [['Mina']],
      [existingKid('kid-1'), existingKid('kid-2')],
    );

    expect(row.parsed).toBeNull();
  });
});

describe('resolveImportRows -- duplicate lines within one file', () => {
  it('records the earlier line a duplicate came from', () => {
    const rows = resolveImportRows(
      [validRow(2), validRow(5)],
      [['Mina'], ['Mina']],
      [],
    );

    expect(rows[0].duplicate_of_row).toBeNull();
    expect(rows[1].duplicate_of_row).toBe(2);
  });

  it('treats the second line as an update, since commit will find the first kid', () => {
    const rows = resolveImportRows([validRow(2), validRow(5)], [['Mina'], ['Mina']], []);

    expect(rows[0].action).toBe('insert');
    expect(rows[1].action).toBe('update');
  });

  it('points a third duplicate at the first line, not the one before it', () => {
    const rows = resolveImportRows(
      [validRow(2), validRow(5), validRow(9)],
      [['Mina'], ['Mina'], ['Mina']],
      [],
    );

    expect(rows[2].duplicate_of_row).toBe(2);
  });

  it('does not treat unrelated kids as duplicates', () => {
    const rows = resolveImportRows(
      [validRow(2), validRow(3, { first: 'Marina' })],
      [['Mina'], ['Marina']],
      [],
    );

    expect(rows.every((row) => row.duplicate_of_row === null)).toBe(true);
  });
});

describe('resolveImportRows -- rows that failed validation', () => {
  it('carries the validation errors through without matching', () => {
    const [row] = resolveImportRows([erroredRow(2)], [['']], [existingKid('kid-1')]);

    expect(row.action).toBe('error');
    expect(row.parsed).toBeNull();
    expect(row.matched_kid_id).toBeNull();
    expect(row.errors).toHaveLength(1);
  });

  it('keeps the raw cells so the review screen can show what was typed', () => {
    const [row] = resolveImportRows([erroredRow(2)], [['Mina', 'not-a-grade']], []);

    expect(row.raw).toEqual(['Mina', 'not-a-grade']);
  });
});

describe('countRows', () => {
  it('counts errored rows separately from importable ones', () => {
    const rows = resolveImportRows(
      [validRow(2), erroredRow(3), validRow(4, { first: 'Marina' })],
      [[], [], []],
      [],
    );

    expect(countRows(rows)).toEqual({ total: 3, valid: 2, errored: 1 });
  });
});
