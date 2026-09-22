/**
 * RLS + constraint tests for the kids / registrations schema
 * (supabase/migrations/*_kids_and_registrations.sql).
 *
 * Per AGENTS.md §7, role-based access control is non-negotiable test coverage and
 * must run against a real database rather than mocks -- these assert that the
 * POLICY denies a wrong role, not merely that the UI hides something.
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

/** The season every test registers into. */
async function currentSeasonId(client: PoolClient): Promise<string> {
  const r = await client.query<{ id: string }>(
    'select id from seasons where is_current limit 1'
  );
  return r.rows[0].id;
}

let kidSeq = 0;

let suffixSeq = 0;
const randomSuffix = () => `${Date.now()}-${(suffixSeq += 1)}`;

/** Creates a kid as superuser (bypassing RLS) for test setup. */
async function createKid(
  client: PoolClient,
  opts: { parentUserId?: string; lastName?: string } = {}
): Promise<string> {
  kidSeq += 1;
  const r = await client.query<{ id: string }>(
    `insert into kids (
       first_name, last_name, dob, gender, home_address,
       emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email, parent_user_id
     ) values ($1,$2,'2014-05-05','female','12 Test St','EC Name','555-0100',
               'Guardian Name','555-0101','guardian@test.local',$3)
     returning id`,
    [`Kid${kidSeq}`, opts.lastName ?? `Last${kidSeq}`, opts.parentUserId ?? null]
  );
  return r.rows[0].id;
}

/** Registers a kid for the current season, optionally onto a team. */
async function createRegistration(
  client: PoolClient,
  kidId: string,
  opts: { teamId?: string; grade?: number; division?: string } = {}
): Promise<string> {
  const seasonId = await currentSeasonId(client);
  const r = await client.query<{ id: string }>(
    `insert into registrations (kid_id, season_id, grade, division, tshirt_size, team_id)
     values ($1,$2,$3,$4,'M',$5) returning id`,
    [kidId, seasonId, opts.grade ?? 5, opts.division ?? 'juniors', opts.teamId ?? null]
  );
  return r.rows[0].id;
}

/**
 * Runs `fn` expecting it to be rejected, and returns the error.
 *
 * Wrapped in a SAVEPOINT for the same reason `asUser` is: a constraint violation
 * marks the whole transaction aborted, so without this the *next* statement in
 * the test fails with "current transaction is aborted" rather than the assertion
 * being reached. `asUser` covers the impersonated calls; this covers the
 * superuser ones that exercise constraints directly.
 */
async function expectRejection(
  client: PoolClient,
  fn: () => Promise<unknown>
): Promise<Error> {
  await client.query('SAVEPOINT expect_fail');
  let caught: unknown;
  let succeeded = false;
  try {
    await fn();
    succeeded = true;
  } catch (err) {
    caught = err;
  }
  if (succeeded) {
    await client.query('RELEASE SAVEPOINT expect_fail');
    throw new Error('expected the statement to be rejected, but it succeeded');
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_fail');
  return caught as Error;
}

/** Creates a ministry team with the given user as its coach. */
async function createTeamWithCoach(client: PoolClient, coachUserId: string): Promise<string> {
  const t = await client.query<{ id: string }>(
    `insert into ministry_teams (name, session) values ('Test Team','juniors') returning id`
  );
  const teamId = t.rows[0].id;
  await client.query('insert into team_coaches (team_id, user_id) values ($1,$2)', [
    teamId,
    coachUserId,
  ]);
  return teamId;
}

describe('kids / registrations -- write access is Admin-only', () => {
  it('an admin can create a kid and a registration', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'admin-writes@test.local' });
      await grantRole(client, adminId, 'admin');
      const seasonId = await currentSeasonId(client);

      const created = await asUser(client, adminId, async () => {
        const k = await client.query<{ id: string }>(
          `insert into kids (
             first_name, last_name, dob, gender, home_address,
             emergency_contact_name, emergency_contact_phone,
             guardian_name, guardian_phone, guardian_email
           ) values ('New','Kid','2013-02-02','male','1 Main St','EC','555-0102',
                     'G','555-0103','g@test.local')
           returning id`
        );
        const reg = await client.query<{ id: string; grade: number }>(
          `insert into registrations (kid_id, season_id, grade, division, tshirt_size)
           values ($1,$2,6,'juniors','YL')
           returning id, grade`,
          [k.rows[0].id, seasonId]
        );
        return reg.rows[0];
      });

      expect(created.id).toBeTruthy();
      expect(created.grade).toBe(6);
    });
  });

  // The ticket is explicit that Program Team does NOT get the CSV import, and the
  // Role Permission Matrix gives "Update full roster" to Admin alone. This is the
  // reason the six-role model exists at all -- is_staff() could not express it.
  it('program team can read but cannot write', async () => {
    await withTx(pool, async (client) => {
      const programId = await createProfile(client, { email: 'program-rw@test.local' });
      await grantRole(client, programId, 'program');
      const kidId = await createKid(client);
      const seasonId = await currentSeasonId(client);

      const visible = await asUser(client, programId, async () => {
        const r = await client.query('select id from kids where id = $1', [kidId]);
        return r.rows;
      });
      expect(visible).toHaveLength(1);

      const write = asUser(client, programId, async () => {
        await client.query(
          `insert into kids (
             first_name, last_name, dob, gender, home_address,
             emergency_contact_name, emergency_contact_phone,
             guardian_name, guardian_phone, guardian_email
           ) values ('Nope','Nope','2013-02-02','male','x','y','z','g','p','e@test.local')`
        );
      });
      await expect(write).rejects.toThrow(/row-level security/i);

      const regWrite = asUser(client, programId, async () => {
        const k = await client.query<{ id: string }>('select id from kids limit 1');
        await client.query(
          `insert into registrations (kid_id, season_id, grade, division, tshirt_size)
           values ($1,$2,5,'juniors','M')`,
          [k.rows[0].id, seasonId]
        );
      });
      await expect(regWrite).rejects.toThrow(/row-level security/i);
    });
  });

  it('a coach cannot write kids or registrations', async () => {
    await withTx(pool, async (client) => {
      const coachId = await createProfile(client, { email: 'coach-write@test.local' });
      await grantRole(client, coachId, 'coach');

      const attempt = asUser(client, coachId, async () => {
        await client.query(
          `insert into kids (
             first_name, last_name, dob, gender, home_address,
             emergency_contact_name, emergency_contact_phone,
             guardian_name, guardian_phone, guardian_email
           ) values ('Coach','Written','2013-02-02','male','x','y','z','g','p','e@test.local')`
        );
      });

      await expect(attempt).rejects.toThrow(/row-level security/i);
    });
  });
});

describe('kids / registrations -- read scoping follows the permission matrix', () => {
  it('a coach sees only kids on their own team', async () => {
    await withTx(pool, async (client) => {
      const coachId = await createProfile(client, { email: 'coach-scope@test.local' });
      await grantRole(client, coachId, 'coach');

      const teamId = await createTeamWithCoach(client, coachId);
      const onTeam = await createKid(client, { lastName: 'OnTeam' });
      await createRegistration(client, onTeam, { teamId });

      const offTeam = await createKid(client, { lastName: 'OffTeam' });
      await createRegistration(client, offTeam);

      const rows = await asUser(client, coachId, async () => {
        const r = await client.query<{ id: string }>('select id from kids');
        return r.rows;
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(onTeam);
    });
  });

  it('a parent sees only their own kids', async () => {
    await withTx(pool, async (client) => {
      const parentId = await createProfile(client, { email: 'parent-scope@test.local' });
      await grantRole(client, parentId, 'parent');

      const mine = await createKid(client, { parentUserId: parentId, lastName: 'Mine' });
      await createRegistration(client, mine);
      const notMine = await createKid(client, { lastName: 'NotMine' });
      await createRegistration(client, notMine);

      const { kids, regs } = await asUser(client, parentId, async () => {
        const k = await client.query<{ id: string }>('select id from kids');
        const r = await client.query<{ kid_id: string }>('select kid_id from registrations');
        return { kids: k.rows, regs: r.rows };
      });

      expect(kids).toHaveLength(1);
      expect(kids[0].id).toBe(mine);
      expect(regs).toHaveLength(1);
      expect(regs[0].kid_id).toBe(mine);
    });
  });

  // Regression guard for the 2026-09-22 decision that REVERSED docs/decisions.md
  // (2026-09-21). Program Team may now see home address and emergency contact.
  // That reversal is what dissolves project_spec.md §2.8's open question about
  // column-level access, so if this ever flips back, the schema needs the
  // separate KidContact table that question proposed.
  it('program team can read home address and emergency contact', async () => {
    await withTx(pool, async (client) => {
      const programId = await createProfile(client, { email: 'program-contact@test.local' });
      await grantRole(client, programId, 'program');
      const kidId = await createKid(client);

      const row = await asUser(client, programId, async () => {
        const r = await client.query<{
          home_address: string;
          emergency_contact_name: string;
          emergency_contact_phone: string;
        }>(
          `select home_address, emergency_contact_name, emergency_contact_phone
             from kids where id = $1`,
          [kidId]
        );
        return r.rows[0];
      });

      expect(row.home_address).toBe('12 Test St');
      expect(row.emergency_contact_name).toBe('EC Name');
      expect(row.emergency_contact_phone).toBe('555-0100');
    });
  });

  it('a prayer team member sees no kids', async () => {
    await withTx(pool, async (client) => {
      const prayerId = await createProfile(client, { email: 'prayer-scope@test.local' });
      await grantRole(client, prayerId, 'prayer');
      const kidId = await createKid(client);
      await createRegistration(client, kidId);

      const rows = await asUser(client, prayerId, async () => {
        const r = await client.query('select id from kids');
        return r.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });

  it('a user with no roles sees no kids', async () => {
    await withTx(pool, async (client) => {
      const userId = await createProfile(client, { email: 'norole-kids@test.local' });
      const kidId = await createKid(client);
      await createRegistration(client, kidId);

      const rows = await asUser(client, userId, async () => {
        const r = await client.query('select id from kids');
        return r.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });

  it('an anonymous request sees no kids at all', async () => {
    await withTx(pool, async (client) => {
      const kidId = await createKid(client);
      await createRegistration(client, kidId);

      await client.query('SET LOCAL ROLE anon');
      const r = await client.query('select * from kids');
      expect(r.rows).toHaveLength(0);
    });
  });
});

describe('registration constraints', () => {
  // Enforced in the database rather than only in Zod because registrations arrive
  // via three paths -- parent form, kid self-registration and CSV import --
  // and form-only validation would let bad rows in through the others.
  it.each([
    [6, 'ambassadors', 'grade below 7 must be juniors'],
    [8, 'juniors', 'grade above 7 must be ambassadors'],
  ])('rejects grade %i in %s (%s)', async (grade, division) => {
    await withTx(pool, async (client) => {
      const kidId = await createKid(client);
      const err = await expectRejection(client, () =>
        createRegistration(client, kidId, { grade, division })
      );
      expect(err.message).toMatch(/registrations_division_matches_grade/);
    });
  });

  it.each([
    ['juniors'],
    ['ambassadors'],
  ])('accepts grade 7 in %s -- the one grade that may choose', async (division) => {
    await withTx(pool, async (client) => {
      const kidId = await createKid(client);
      const id = await createRegistration(client, kidId, { grade: 7, division });
      expect(id).toBeTruthy();
    });
  });

  // Each grade is paired with the division its own rule would demand, so that the
  // range constraint is what fails rather than the division constraint firing first.
  it.each([
    [3, 'juniors'],
    [13, 'ambassadors'],
  ])('rejects out-of-range grade %i', async (grade, division) => {
    await withTx(pool, async (client) => {
      const kidId = await createKid(client);
      const err = await expectRejection(client, () =>
        createRegistration(client, kidId, { grade, division })
      );
      expect(err.message).toMatch(/registrations_grade_range/);
    });
  });

  it('rejects a T-shirt size outside the allowed set', async () => {
    await withTx(pool, async (client) => {
      const kidId = await createKid(client);
      const seasonId = await currentSeasonId(client);
      const err = await expectRejection(client, () =>
        client.query(
          `insert into registrations (kid_id, season_id, grade, division, tshirt_size)
           values ($1,$2,5,'juniors','LARGE')`,
          [kidId, seasonId]
        )
      );
      expect(err.message).toMatch(/registrations_tshirt_size_values/);
    });
  });

  it('allows a kid to register across seasons but not twice in one', async () => {
    await withTx(pool, async (client) => {
      const kidId = await createKid(client);
      await createRegistration(client, kidId);

      const err = await expectRejection(client, () => createRegistration(client, kidId));
      expect(err.message).toMatch(/registrations_kid_season_key/);

      // The whole point of the split: the same kid registers again next season.
      const next = await client.query<{ id: string }>(
        `insert into seasons (name, starts_on, is_current)
         values ('CIS 2027-2028', current_date + 365, false) returning id`
      );
      const second = await client.query<{ id: string }>(
        `insert into registrations (kid_id, season_id, grade, division, tshirt_size)
         values ($1,$2,6,'juniors','M') returning id`,
        [kidId, next.rows[0].id]
      );
      expect(second.rows[0].id).toBeTruthy();
    });
  });

  // Deliberately non-unique, unlike the flat table's old registrations_identity_key:
  // twins share name + DOB, and a unique index would abort an entire import commit.
  it('permits two kids sharing name and date of birth (twins)', async () => {
    await withTx(pool, async (client) => {
      const insertTwin = () =>
        client.query<{ id: string }>(
          `insert into kids (
             first_name, last_name, dob, gender, home_address,
             emergency_contact_name, emergency_contact_phone,
             guardian_name, guardian_phone, guardian_email
           ) values ('Sam','Twin','2014-03-03','female','1 Twin St','EC','555',
                     'G','555','t@test.local')
           returning id`
        );

      const a = await insertTwin();
      const b = await insertTwin();
      expect(a.rows[0].id).not.toBe(b.rows[0].id);
    });
  });
});

/**
 * The attendance module calls these three from the UI, so the schema change had
 * to rewrite them rather than defer them (2026-09-22 decision). Attendance
 * submission logic is non-negotiable coverage per AGENTS.md §7.
 */
describe('attendance functions after the kid/registration split', () => {
  /** Creates an attendance group and a day in the current season. */
  async function createDay(
    client: PoolClient,
    group: { session?: string | null; gradeMin?: number | null; gradeMax?: number | null } = {}
  ): Promise<string> {
    const seasonId = await currentSeasonId(client);
    const g = await client.query<{ id: string }>(
      `insert into attendance_groups (name, session, grade_min, grade_max)
       values ('Test Group', $1, $2, $3) returning id`,
      [group.session ?? null, group.gradeMin ?? null, group.gradeMax ?? null]
    );
    const d = await client.query<{ id: string }>(
      `insert into attendance_days (group_id, date, season_id)
       values ($1, current_date, $2) returning id`,
      [g.rows[0].id, seasonId]
    );
    return d.rows[0].id;
  }

  /**
   * Runs populate_attendance_day as a freshly-granted coach.
   *
   * It is gated on is_coach(), which reads auth.uid() -- so calling it as the
   * superuser (where auth.uid() is null) is now rejected, exactly as an
   * anonymous PostgREST request would be.
   */
  async function populateAsCoach(client: PoolClient, dayId: string): Promise<number> {
    const coachId = await createProfile(client, {
      email: `populate-coach-${randomSuffix()}@test.local`,
    });
    await grantRole(client, coachId, 'coach');
    return asUser(client, coachId, async () => {
      const r = await client.query<{ populate_attendance_day: number }>(
        'select populate_attendance_day($1)',
        [dayId]
      );
      return r.rows[0].populate_attendance_day;
    });
  }

  /**
   * Which of the given kids ended up on the day's roster.
   *
   * Assertions are about membership rather than row counts: the database may
   * already hold unrelated registrations for the current season, and a test that
   * counts every row only passes on a pristine database.
   */
  async function rosteredKids(
    client: PoolClient,
    dayId: string,
    kidIds: string[]
  ): Promise<string[]> {
    const r = await client.query<{ kid_id: string }>(
      `select r.kid_id from attendance_records ar
         join registrations r on r.id = ar.registration_id
        where ar.day_id = $1 and r.kid_id = any($2::uuid[])`,
      [dayId, kidIds]
    );
    return r.rows.map((x) => x.kid_id);
  }

  // populate_attendance_day is SECURITY DEFINER and PostgREST exposes it at
  // /rest/v1/rpc/, so without an explicit gate an unauthenticated caller could
  // write attendance_records. Regression guard for that fix.
  it('populate_attendance_day refuses an anonymous caller', async () => {
    await withTx(pool, async (client) => {
      const dayId = await createDay(client);

      // Rolled back and the role explicitly reset: a failed statement aborts the
      // transaction, and without restoring the superuser role afterwards the
      // *next* test's setup fails with "permission denied for table users".
      await client.query('SAVEPOINT anon_probe');
      await client.query('SET LOCAL ROLE anon');
      let message = '';
      try {
        await client.query('select populate_attendance_day($1)', [dayId]);
      } catch (err) {
        message = (err as Error).message;
      }
      await client.query('ROLLBACK TO SAVEPOINT anon_probe');
      await client.query('RESET ROLE');

      expect(message).toMatch(/coach or staff only/i);
    });
  });

  it('populate_attendance_day refuses a signed-in user who is neither coach nor staff', async () => {
    await withTx(pool, async (client) => {
      const parentId = await createProfile(client, { email: 'parent-populate@test.local' });
      await grantRole(client, parentId, 'parent');
      const dayId = await createDay(client);

      // Deliberately calls the function directly as the parent -- not through
      // populateAsCoach, which would grant the coach role this test is checking
      // the absence of.
      const attempt = asUser(client, parentId, async () => {
        await client.query('select populate_attendance_day($1)', [dayId]);
      });

      await expect(attempt).rejects.toThrow(/coach or staff only/i);
    });
  });

  it('populate_attendance_day selects registrations by division and grade', async () => {
    await withTx(pool, async (client) => {
      const junior = await createKid(client, { lastName: 'Junior' });
      await createRegistration(client, junior, { grade: 5, division: 'juniors' });
      const ambassador = await createKid(client, { lastName: 'Ambassador' });
      await createRegistration(client, ambassador, { grade: 9, division: 'ambassadors' });

      const dayId = await createDay(client, { session: 'juniors' });
      await populateAsCoach(client, dayId);

      const rostered = await rosteredKids(client, dayId, [junior, ambassador]);
      expect(rostered).toEqual([junior]);
    });
  });

  it('populate_attendance_day honours the integer grade range', async () => {
    await withTx(pool, async (client) => {
      const inRange = await createKid(client, { lastName: 'InRange' });
      await createRegistration(client, inRange, { grade: 5, division: 'juniors' });
      const outOfRange = await createKid(client, { lastName: 'OutOfRange' });
      await createRegistration(client, outOfRange, { grade: 12, division: 'ambassadors' });

      const dayId = await createDay(client, { gradeMin: 4, gradeMax: 6 });
      await populateAsCoach(client, dayId);

      const rostered = await rosteredKids(client, dayId, [inRange, outOfRange]);
      expect(rostered).toEqual([inRange]);
    });
  });

  // New behavior: the flat table had no season, so the old version could not
  // scope by one. A registration from another season must not be pulled in.
  it('populate_attendance_day ignores registrations from another season', async () => {
    await withTx(pool, async (client) => {
      const kidId = await createKid(client);
      const other = await client.query<{ id: string }>(
        `insert into seasons (name, starts_on, is_current)
         values ('Some Other Season', current_date - 400, false) returning id`
      );
      await client.query(
        `insert into registrations (kid_id, season_id, grade, division, tshirt_size)
         values ($1,$2,5,'juniors','M')`,
        [kidId, other.rows[0].id]
      );

      const dayId = await createDay(client);
      await populateAsCoach(client, dayId);

      const rostered = await rosteredKids(client, dayId, [kidId]);
      expect(rostered).toEqual([]);
    });
  });

  it('attendance_summary reports names from kids and counts attendance', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'summary-admin@test.local' });
      await grantRole(client, adminId, 'admin');

      const kidId = await createKid(client, { lastName: 'Summarised' });
      const regId = await createRegistration(client, kidId, { grade: 6, division: 'juniors' });
      const dayId = await createDay(client);
      await client.query(
        `insert into attendance_records (day_id, registration_id, status)
         values ($1,$2,'present')`,
        [dayId, regId]
      );

      // SECURITY DEFINER, but gated internally on is_coach() -- so it must be
      // called as a user who passes that check.
      const row = await asUser(client, adminId, async () => {
        const r = await client.query<{
          registration_id: string;
          first_name: string;
          last_name: string;
          grade: number;
          division: string;
          present: number;
          attended: number;
        }>('select * from attendance_summary(null) where registration_id = $1', [regId]);
        return r.rows[0];
      });

      expect(row.last_name).toBe('Summarised');
      expect(row.grade).toBe(6);
      expect(row.division).toBe('juniors');
      expect(row.present).toBe(1);
      expect(row.attended).toBe(1);
    });
  });

  it('attendance_summary returns nothing to a user who is not staff or coach', async () => {
    await withTx(pool, async (client) => {
      const parentId = await createProfile(client, { email: 'summary-parent@test.local' });
      await grantRole(client, parentId, 'parent');
      const kidId = await createKid(client);
      await createRegistration(client, kidId);

      const rows = await asUser(client, parentId, async () => {
        const r = await client.query('select * from attendance_summary(null)');
        return r.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });

  it('start_new_season closes the current season and opens the new one', async () => {
    await withTx(pool, async (client) => {
      const adminId = await createProfile(client, { email: 'season-admin@test.local' });
      await grantRole(client, adminId, 'admin');
      const previous = await currentSeasonId(client);

      const newId = await asUser(client, adminId, async () => {
        const r = await client.query<{ start_new_season: string }>(
          `select start_new_season('CIS 2099-2100')`
        );
        return r.rows[0].start_new_season;
      });

      const rows = await client.query<{ id: string; is_current: boolean; ends_on: string | null }>(
        'select id, is_current, ends_on from seasons where id in ($1,$2)',
        [previous, newId]
      );
      const before = rows.rows.find((r) => r.id === previous)!;
      const after = rows.rows.find((r) => r.id === newId)!;

      expect(before.is_current).toBe(false);
      expect(before.ends_on).not.toBeNull();
      expect(after.is_current).toBe(true);
    });
  });

  it('start_new_season refuses a non-admin', async () => {
    await withTx(pool, async (client) => {
      const coachId = await createProfile(client, { email: 'season-coach@test.local' });
      await grantRole(client, coachId, 'coach');

      const attempt = asUser(client, coachId, async () => {
        await client.query(`select start_new_season('Coach Season')`);
      });

      await expect(attempt).rejects.toThrow(/staff only/i);
    });
  });
});
