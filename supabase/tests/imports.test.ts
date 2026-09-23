/**
 * RLS + behaviour tests for the CSV import staging tables and `import_commit()`
 * (supabase/migrations/*_import_staging.sql).
 *
 * Two things are being protected here. First, access: per AGENTS.md §7,
 * role-based access control is non-negotiable coverage and must run against a
 * real database, so these assert the POLICY denies a wrong role rather than that
 * the UI hides something. `import_commit()` is SECURITY DEFINER, which makes it
 * the one place a non-Admin could otherwise write the roster.
 *
 * Second, the commit semantics ENG-5 turns on: nothing is written before commit,
 * a returning kid is matched instead of duplicated, an ambiguous match is never
 * resolved by guessing, and committing twice does not import twice.
 *
 * Run with `npm run test:db` (requires `npx supabase start`). See
 * supabase/tests/helpers.ts for how users are impersonated.
 */
import type { Pool, PoolClient } from 'pg';
import { asUser, createProfile, grantRole, makePool, withTx } from './helpers';

let pool: Pool;

beforeAll(() => {
  pool = makePool();
});

afterAll(async () => {
  await pool.end();
});

/**
 * `withTx`, plus an empty roster to start from.
 *
 * Several assertions here count all rows in `kids` or `import_batches`, which
 * silently depended on the local database being empty -- so anything that left
 * data behind (the Playwright suite, a manual import) broke them. Clearing
 * inside the transaction makes each test deterministic without touching the
 * developer's data: `withTx` always rolls back, so these deletes never land.
 */
async function withCleanTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTx(pool, async (client) => {
    await client.query('delete from import_rows');
    await client.query('delete from import_batches');
    await client.query('delete from registrations');
    await client.query('delete from kids');
    return fn(client);
  });
}

async function currentSeasonId(client: PoolClient): Promise<string> {
  const r = await client.query<{ id: string }>(
    'select id from seasons where is_current limit 1'
  );
  return r.rows[0].id;
}

interface KidOverrides {
  first?: string;
  last?: string;
  dob?: string;
  allergies?: string | null;
  email?: string | null;
  grade?: number;
  division?: string;
  tshirt?: string;
}

/**
 * The `parsed` payload the route stages for one row -- the shape
 * `kidRegistrationSchema` produces, which is what `import_commit()` reads.
 */
function parsedPayload(o: KidOverrides = {}) {
  return {
    kid: {
      first_name: o.first ?? 'Mina',
      last_name: o.last ?? 'Guirguis',
      dob: o.dob ?? '2014-03-02',
      gender: 'male',
      photo_path: null,
      email: o.email === undefined ? null : o.email,
      phone: null,
      allergies: o.allergies === undefined ? null : o.allergies,
      home_address: '1 Church Way',
      emergency_contact_name: 'Mariam Guirguis',
      emergency_contact_phone: '555-0111',
      guardian_name: 'Mariam Guirguis',
      guardian_phone: '555-0111',
      guardian_email: 'mariam@test.local',
      skill_tags: [],
    },
    registration: {
      grade: o.grade ?? 6,
      division: o.division ?? 'juniors',
      tshirt_size: o.tshirt ?? 'YM',
      top_sports: null,
    },
  };
}

/** Stages a batch plus its rows as superuser, ready to commit. */
async function stageBatch(
  client: PoolClient,
  opts: {
    uploadedBy: string;
    rows: Array<{ rowNumber: number; parsed: object | null; errors?: object[] }>;
    status?: string;
  }
): Promise<string> {
  const seasonId = await currentSeasonId(client);
  const errored = opts.rows.filter((r) => r.parsed === null).length;

  const b = await client.query<{ id: string }>(
    `insert into import_batches
       (file_name, season_id, uploaded_by, status, total_rows, valid_rows, error_rows)
     values ('roster.csv', $1, $2, $3, $4, $5, $6)
     returning id`,
    [
      seasonId,
      opts.uploadedBy,
      opts.status ?? 'ready',
      opts.rows.length,
      opts.rows.length - errored,
      errored,
    ]
  );
  const batchId = b.rows[0].id;

  for (const row of opts.rows) {
    await client.query(
      `insert into import_rows (batch_id, row_number, raw, parsed, errors, action)
       values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)`,
      [
        batchId,
        row.rowNumber,
        JSON.stringify(['raw', 'cells']),
        row.parsed === null ? null : JSON.stringify(row.parsed),
        JSON.stringify(row.errors ?? []),
        row.parsed === null ? 'error' : 'insert',
      ]
    );
  }

  return batchId;
}

/** Creates a kid directly, for the returning-kid cases. */
async function createKid(
  client: PoolClient,
  o: KidOverrides = {}
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into kids (
       first_name, last_name, dob, gender, home_address,
       emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email, allergies
     ) values ($1,$2,$3,'male','Old Address','EC','555-0000',
               'Old Guardian','555-0001','old@test.local',$4)
     returning id`,
    [o.first ?? 'Mina', o.last ?? 'Guirguis', o.dob ?? '2014-03-02', o.allergies ?? null]
  );
  return r.rows[0].id;
}

async function commitAs(client: PoolClient, userId: string, batchId: string) {
  return asUser(client, userId, async () => {
    const r = await client.query<{ import_commit: Record<string, number> }>(
      'select import_commit($1) as import_commit',
      [batchId]
    );
    return r.rows[0].import_commit;
  });
}

async function makeAdmin(client: PoolClient, email: string): Promise<string> {
  const id = await createProfile(client, { email });
  await grantRole(client, id, 'admin');
  return id;
}

describe('import staging tables -- Admin only', () => {
  it('an admin can create and read a batch', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin@test.local');
      const seasonId = await currentSeasonId(client);

      const rows = await asUser(client, adminId, async () => {
        await client.query(
          `insert into import_batches (file_name, season_id, uploaded_by)
           values ('roster.csv', $1, $2)`,
          [seasonId, adminId]
        );
        const r = await client.query('select id from import_batches');
        return r.rowCount;
      });

      expect(rows).toBe(1);
    });
  });

  // Program Team can read the roster, but ENG-5 is explicit that CSV import is
  // Admin-only -- so unlike `kids`, there is no wider read policy here.
  it('program team can neither read nor write batches', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin2@test.local');
      const programId = await createProfile(client, { email: 'imp-program@test.local' });
      await grantRole(client, programId, 'program');
      await stageBatch(client, { uploadedBy: adminId, rows: [] });

      const visible = await asUser(client, programId, async () => {
        const r = await client.query('select id from import_batches');
        return r.rowCount;
      });

      expect(visible).toBe(0);

      // Resolved as superuser: Program Team cannot read `seasons` either (that
      // policy is is_coach()), so looking it up inside the impersonated block
      // would fail for the wrong reason and mask what is being asserted.
      const seasonId = await currentSeasonId(client);

      await expect(
        asUser(client, programId, async () => {
          await client.query(
            `insert into import_batches (file_name, season_id) values ('x.csv', $1)`,
            [seasonId]
          );
        })
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('a coach cannot read staged rows, which hold the same minor data', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin3@test.local');
      const coachId = await createProfile(client, { email: 'imp-coach@test.local' });
      await grantRole(client, coachId, 'coach');

      await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      const visible = await asUser(client, coachId, async () => {
        const r = await client.query('select id from import_rows');
        return r.rowCount;
      });

      expect(visible).toBe(0);
    });
  });

  it('an anonymous request sees no batches at all', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin4@test.local');
      await stageBatch(client, { uploadedBy: adminId, rows: [] });

      await client.query('SET LOCAL ROLE anon');
      const r = await client.query('select id from import_batches');
      await client.query('RESET ROLE');

      expect(r.rowCount).toBe(0);
    });
  });
});

describe('import_commit -- authorisation', () => {
  // The function is SECURITY DEFINER, so it writes the roster regardless of the
  // caller's RLS. Its own has_role('admin') check is therefore the only thing
  // standing between a coach and a rewritten roster.
  it('refuses a non-admin even though the function is SECURITY DEFINER', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin5@test.local');
      const coachId = await createProfile(client, { email: 'imp-coach2@test.local' });
      await grantRole(client, coachId, 'coach');

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      await expect(commitAs(client, coachId, batchId)).rejects.toThrow(/Admin/i);

      const kids = await client.query('select id from kids');
      expect(kids.rowCount).toBe(0);
    });
  });

  it('refuses program team', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin6@test.local');
      const programId = await createProfile(client, { email: 'imp-program2@test.local' });
      await grantRole(client, programId, 'program');

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      await expect(commitAs(client, programId, batchId)).rejects.toThrow(/Admin/i);
    });
  });
});

describe('import_commit -- writing the roster', () => {
  it('creates the kid and their registration for the batch season', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin7@test.local');
      const seasonId = await currentSeasonId(client);

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload({ grade: 8, division: 'ambassadors' }) }],
      });

      const summary = await commitAs(client, adminId, batchId);
      expect(summary.inserted).toBe(1);
      expect(summary.updated).toBe(0);

      const r = await client.query(
        `select k.first_name, k.last_name, r.grade, r.division, r.season_id, r.source
           from registrations r join kids k on k.id = r.kid_id`
      );
      expect(r.rows[0]).toMatchObject({
        first_name: 'Mina',
        last_name: 'Guirguis',
        grade: 8,
        division: 'ambassadors',
        season_id: seasonId,
        source: 'import',
      });
    });
  });

  // The CSV's consent answer refers to a paper form handed in months earlier, so
  // it is not evidence of consent given now (docs/decisions.md 2026-09-22).
  it('never records consent', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin8@test.local');
      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      await commitAs(client, adminId, batchId);

      const r = await client.query('select consent_given_at from registrations');
      expect(r.rows[0].consent_given_at).toBeNull();
    });
  });

  it('skips rows that failed validation', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'imp-admin9@test.local');
      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [
          { rowNumber: 2, parsed: null, errors: [{ message: 'Grade is required' }] },
          { rowNumber: 3, parsed: parsedPayload({ first: 'Marina' }) },
        ],
      });

      const summary = await commitAs(client, adminId, batchId);

      expect(summary.inserted).toBe(1);
      const kids = await client.query('select first_name from kids');
      expect(kids.rows.map((k) => k.first_name)).toEqual(['Marina']);
    });
  });
});

describe('import_commit -- returning kids', () => {
  it('matches an existing kid instead of creating a second record', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'ret-admin1@test.local');
      const kidId = await createKid(client);

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      const summary = await commitAs(client, adminId, batchId);

      expect(summary.inserted).toBe(0);
      expect(summary.updated).toBe(1);

      const kids = await client.query('select id from kids');
      expect(kids.rowCount).toBe(1);
      expect(kids.rows[0].id).toBe(kidId);
    });
  });

  // Mirrors identityKey() in src/lib/import/csv/rows.ts and the kids_identity_idx
  // expression. All three normalise the same way, or the preview shown to the
  // Admin would disagree with what commit actually does.
  it('matches case-insensitively and ignores surrounding whitespace', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'ret-admin2@test.local');
      await createKid(client, { first: 'Mina', last: 'Guirguis' });

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload({ first: '  MINA', last: 'guirguis ' }) }],
      });

      const summary = await commitAs(client, adminId, batchId);

      expect(summary.updated).toBe(1);
      expect((await client.query('select id from kids')).rowCount).toBe(1);
    });
  });

  it('treats a different birthday as a different child', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'ret-admin3@test.local');
      await createKid(client, { dob: '2013-03-02' });

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload({ dob: '2014-03-02' }) }],
      });

      const summary = await commitAs(client, adminId, batchId);

      expect(summary.inserted).toBe(1);
      expect((await client.query('select id from kids')).rowCount).toBe(2);
    });
  });

  // A blank cell means "not answered", not "delete this". Dropping a recorded
  // allergy because a parent left the box empty is the dangerous direction.
  it('does not erase an existing allergy when the new row leaves it blank', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'ret-admin4@test.local');
      await createKid(client, { allergies: 'Peanuts' });

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload({ allergies: null }) }],
      });

      await commitAs(client, adminId, batchId);

      const r = await client.query('select allergies from kids');
      expect(r.rows[0].allergies).toBe('Peanuts');
    });
  });

  it('refreshes required contact details from the newer row', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'ret-admin5@test.local');
      await createKid(client);

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      await commitAs(client, adminId, batchId);

      const r = await client.query('select home_address, guardian_email from kids');
      expect(r.rows[0]).toMatchObject({
        home_address: '1 Church Way',
        guardian_email: 'mariam@test.local',
      });
    });
  });

  it('updates the season registration rather than failing on the unique key', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'ret-admin6@test.local');
      const kidId = await createKid(client);
      const seasonId = await currentSeasonId(client);
      await client.query(
        `insert into registrations (kid_id, season_id, grade, division, tshirt_size)
         values ($1,$2,5,'juniors','YS')`,
        [kidId, seasonId]
      );

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload({ grade: 6, tshirt: 'YL' }) }],
      });

      await commitAs(client, adminId, batchId);

      const r = await client.query('select grade, tshirt_size from registrations');
      expect(r.rowCount).toBe(1);
      expect(r.rows[0]).toMatchObject({ grade: 6, tshirt_size: 'YL' });
    });
  });
});

describe('import_commit -- ambiguous matches', () => {
  // The identity key is deliberately non-unique. Picking one of two matches
  // would overwrite a real child's medical and contact details at random.
  it('skips a row matching two kids and reports it, without touching either', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'amb-admin1@test.local');
      await createKid(client);
      await createKid(client);

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      const summary = await commitAs(client, adminId, batchId);

      expect(summary.ambiguous).toBe(1);
      expect(summary.inserted).toBe(0);
      expect(summary.updated).toBe(0);

      const row = await client.query(
        'select action, errors from import_rows where row_number = 2'
      );
      expect(row.rows[0].action).toBe('error');
      expect(JSON.stringify(row.rows[0].errors)).toMatch(/Matches 2 existing kids/);

      // Neither of the two was modified.
      const kids = await client.query(`select home_address from kids`);
      expect(kids.rows.every((k) => k.home_address === 'Old Address')).toBe(true);
    });
  });

  it('still commits the rest of the batch', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'amb-admin2@test.local');
      await createKid(client);
      await createKid(client);

      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [
          { rowNumber: 2, parsed: parsedPayload() },
          { rowNumber: 3, parsed: parsedPayload({ first: 'Marina' }) },
        ],
      });

      const summary = await commitAs(client, adminId, batchId);

      expect(summary.ambiguous).toBe(1);
      expect(summary.inserted).toBe(1);
    });
  });
});

describe('import_commit -- committing twice', () => {
  // The guard is the status transition in the database, never a disabled button.
  it('rejects a second commit instead of importing everything again', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'twice-admin1@test.local');
      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      await commitAs(client, adminId, batchId);
      await expect(commitAs(client, adminId, batchId)).rejects.toThrow(/not ready to commit/i);

      expect((await client.query('select id from kids')).rowCount).toBe(1);
      expect((await client.query('select id from registrations')).rowCount).toBe(1);
    });
  });

  it('marks the batch committed', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'twice-admin2@test.local');
      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      await commitAs(client, adminId, batchId);

      const r = await client.query(
        'select status, committed_at from import_batches where id = $1',
        [batchId]
      );
      expect(r.rows[0].status).toBe('committed');
      expect(r.rows[0].committed_at).not.toBeNull();
    });
  });

  // A batch still being written must not be committable -- the route flips it to
  // `ready` only after every row has landed.
  it('refuses a batch that is still pending', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'twice-admin3@test.local');
      const batchId = await stageBatch(client, {
        uploadedBy: adminId,
        status: 'pending',
        rows: [{ rowNumber: 2, parsed: parsedPayload() }],
      });

      await expect(commitAs(client, adminId, batchId)).rejects.toThrow(/not ready to commit/i);
      expect((await client.query('select id from kids')).rowCount).toBe(0);
    });
  });
});

describe('import_commit -- nothing is written before commit', () => {
  it('leaves kids and registrations untouched while a batch sits ready', async () => {
    await withCleanTx(async (client) => {
      const adminId = await makeAdmin(client, 'pre-admin1@test.local');

      await stageBatch(client, {
        uploadedBy: adminId,
        rows: [
          { rowNumber: 2, parsed: parsedPayload() },
          { rowNumber: 3, parsed: parsedPayload({ first: 'Marina' }) },
        ],
      });

      expect((await client.query('select id from kids')).rowCount).toBe(0);
      expect((await client.query('select id from registrations')).rowCount).toBe(0);
    });
  });
});
