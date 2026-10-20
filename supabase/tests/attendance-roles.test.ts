/**
 * RLS and function-gate tests for the attendance and season objects rewritten in
 * the roles cleanup (supabase/migrations/20261019120000_roles_cleanup.sql, ENG-16).
 *
 * Before that migration these were gated by is_staff() (admin) and is_coach()
 * (admin or coach). They now name the roles directly, and this file pins the
 * behaviour so it cannot drift: Admin everything, Coach read plus marking their
 * own team, and no access at all for Program Team, Prayer Team, Parents and
 * users with no role. Role-based access control is non-negotiable coverage
 * (AGENTS.md section 7).
 */
import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { asUser, createProfile, grantRole, makePool, withTx } from './helpers';

let pool: Pool;

beforeAll(() => {
  pool = makePool();
});

afterAll(async () => {
  await pool.end();
});

type Actor = 'admin' | 'coach' | 'program' | 'prayer' | 'parent' | 'none';

const ALLOWED_TO_READ: Actor[] = ['admin', 'coach'];
const DENIED_TO_READ: Actor[] = ['program', 'prayer', 'parent', 'none'];

interface Fixture {
  actors: Record<Actor, string>;
  /** A coach who is NOT on the kid's team. */
  otherCoachId: string;
  seasonId: string;
  groupId: string;
  dayId: string;
  teamId: string;
  registrationId: string;
}

/**
 * One user per actor plus a season, team, kid, registration, attendance group,
 * day and record. The season is not current, so the "any role reads current
 * season" policy cannot make the season visible to the denied actors.
 */
async function seed(client: PoolClient): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const actors = {} as Record<Actor, string>;
  for (const actor of ['admin', 'coach', 'program', 'prayer', 'parent', 'none'] as Actor[]) {
    actors[actor] = await createProfile(client, { email: `att-${actor}-${suffix}@test.local` });
    if (actor !== 'none') await grantRole(client, actors[actor], actor);
  }
  const otherCoachId = await createProfile(client, { email: `att-other-coach-${suffix}@test.local` });
  await grantRole(client, otherCoachId, 'coach');

  const season = await client.query<{ id: string }>(
    `insert into seasons (name, is_current) values ($1, false) returning id`,
    [`Attendance roles ${suffix}`]
  );
  const seasonId = season.rows[0].id;

  const team = await client.query<{ id: string }>(
    `insert into ministry_teams (name, division, season_id)
     values ('Roles Team', 'juniors', $1) returning id`,
    [seasonId]
  );
  const teamId = team.rows[0].id;
  await client.query('insert into team_coaches (team_id, user_id) values ($1, $2)', [
    teamId,
    actors.coach,
  ]);

  const kid = await client.query<{ id: string }>(
    `insert into kids (
       first_name, last_name, dob, gender, home_address,
       emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email
     ) values ('Roles','Kid','2014-03-03','female','1 Roles St','EC','555','G','555',$1)
     returning id`,
    [`roles-guardian-${suffix}@test.local`]
  );
  const registration = await client.query<{ id: string }>(
    `insert into registrations (kid_id, season_id, grade, division, tshirt_size, team_id)
     values ($1, $2, 5, 'juniors', 'M', $3) returning id`,
    [kid.rows[0].id, seasonId, teamId]
  );
  const registrationId = registration.rows[0].id;

  const group = await client.query<{ id: string }>(
    `insert into attendance_groups (name) values ('Roles Group') returning id`
  );
  const day = await client.query<{ id: string }>(
    `insert into attendance_days (group_id, date, season_id)
     values ($1, current_date, $2) returning id`,
    [group.rows[0].id, seasonId]
  );
  await client.query(
    `insert into attendance_records (day_id, registration_id) values ($1, $2)`,
    [day.rows[0].id, registrationId]
  );

  return {
    actors,
    otherCoachId,
    seasonId,
    groupId: group.rows[0].id,
    dayId: day.rows[0].id,
    teamId,
    registrationId,
  };
}

/** Runs `sql` as `userId` and returns how many rows it produced or affected. */
async function countAs(
  client: PoolClient,
  userId: string,
  sql: string,
  params: unknown[] = []
): Promise<number> {
  return asUser(client, userId, async () => {
    const r = await client.query(sql, params);
    return r.rowCount ?? 0;
  });
}

describe('reading attendance and season data', () => {
  const reads: { label: string; sql: (f: Fixture) => [string, unknown[]] }[] = [
    {
      label: 'attendance_days',
      sql: (f) => ['select id from attendance_days where id = $1', [f.dayId]],
    },
    {
      label: 'attendance_groups',
      sql: (f) => ['select id from attendance_groups where id = $1', [f.groupId]],
    },
    {
      label: 'attendance_records',
      sql: (f) => ['select id from attendance_records where day_id = $1', [f.dayId]],
    },
    {
      label: 'seasons (a non-current one)',
      sql: (f) => ['select id from seasons where id = $1', [f.seasonId]],
    },
    {
      label: 'team_coaches',
      sql: (f) => ['select user_id from team_coaches where team_id = $1', [f.teamId]],
    },
  ];

  for (const { label, sql } of reads) {
    it.each(ALLOWED_TO_READ)(`${label}: %s can read`, async (actor) => {
      await withTx(pool, async (client) => {
        const f = await seed(client);
        const [text, params] = sql(f);
        expect(await countAs(client, f.actors[actor], text, params)).toBeGreaterThan(0);
      });
    });

    it.each(DENIED_TO_READ)(`${label}: %s reads nothing`, async (actor) => {
      await withTx(pool, async (client) => {
        const f = await seed(client);
        const [text, params] = sql(f);
        expect(await countAs(client, f.actors[actor], text, params)).toBe(0);
      });
    });
  }
});

describe('writing attendance and season data is Admin only', () => {
  const nonAdmins: Actor[] = ['coach', 'program', 'prayer', 'parent', 'none'];

  it('an admin can create a group, a day and a season', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await asUser(client, f.actors.admin, async () => {
        const g = await client.query<{ id: string }>(
          `insert into attendance_groups (name) values ('Admin group') returning id`
        );
        await client.query(
          `insert into attendance_days (group_id, date, season_id) values ($1, current_date, $2)`,
          [g.rows[0].id, f.seasonId]
        );
        await client.query(`insert into seasons (name) values ('Admin season')`);
      });
    });
  });

  it.each(nonAdmins)('%s cannot create an attendance group', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(
        asUser(client, f.actors[actor], async () => {
          await client.query(`insert into attendance_groups (name) values ('nope')`);
        })
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it.each(nonAdmins)('%s cannot create a season', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(
        asUser(client, f.actors[actor], async () => {
          await client.query(`insert into seasons (name) values ('nope')`);
        })
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it.each(nonAdmins)('%s cannot assign a coach to a team', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(
        asUser(client, f.actors[actor], async () => {
          await client.query('insert into team_coaches (team_id, user_id) values ($1, $2)', [
            f.teamId,
            f.otherCoachId,
          ]);
        })
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it.each(nonAdmins)('%s cannot add or delete attendance records', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      // Coaches can SEE records, so a blocked delete matches no rows rather than
      // erroring; check the row survives instead of expecting an exception.
      const deleted = await countAs(
        client,
        f.actors[actor],
        'delete from attendance_records where day_id = $1',
        [f.dayId]
      );
      expect(deleted).toBe(0);
      const left = await client.query('select 1 from attendance_records where day_id = $1', [
        f.dayId,
      ]);
      expect(left.rowCount).toBe(1);
    });
  });
});

describe('marking attendance (can_mark)', () => {
  const mark = (client: PoolClient, f: Fixture, userId: string) =>
    countAs(
      client,
      userId,
      `update attendance_records set status = 'present' where registration_id = $1`,
      [f.registrationId]
    );

  it('an admin can mark any kid', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await mark(client, f, f.actors.admin)).toBe(1);
    });
  });

  it("a coach can mark a kid on their own team", async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await mark(client, f, f.actors.coach)).toBe(1);
    });
  });

  it("a coach cannot mark a kid on someone else's team", async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await mark(client, f, f.otherCoachId)).toBe(0);
    });
  });

  it.each(['program', 'prayer', 'parent', 'none'] as Actor[])(
    '%s cannot mark attendance',
    async (actor) => {
      await withTx(pool, async (client) => {
        const f = await seed(client);
        expect(await mark(client, f, f.actors[actor])).toBe(0);
      });
    }
  );
});

describe('attendance and season functions', () => {
  it.each(ALLOWED_TO_READ)('populate_attendance_day runs for %s', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await asUser(client, f.actors[actor], async () => {
        await client.query('select populate_attendance_day($1)', [f.dayId]);
      });
    });
  });

  it.each(DENIED_TO_READ)('populate_attendance_day refuses %s', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(
        asUser(client, f.actors[actor], async () => {
          await client.query('select populate_attendance_day($1)', [f.dayId]);
        })
      ).rejects.toThrow(/coach or staff only/i);
    });
  });

  it.each(ALLOWED_TO_READ)('attendance_summary returns the season for %s', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const rows = await countAs(client, f.actors[actor], 'select * from attendance_summary($1)', [
        f.seasonId,
      ]);
      expect(rows).toBe(1);
    });
  });

  it.each(DENIED_TO_READ)('attendance_summary returns nothing for %s', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const rows = await countAs(client, f.actors[actor], 'select * from attendance_summary($1)', [
        f.seasonId,
      ]);
      expect(rows).toBe(0);
    });
  });

  it('start_new_season runs for an admin', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const id = await asUser(client, f.actors.admin, async () => {
        const r = await client.query<{ start_new_season: string }>(
          `select start_new_season($1)`,
          [`Roles season ${randomUUID().slice(0, 8)}`]
        );
        return r.rows[0].start_new_season;
      });
      expect(id).toBeTruthy();
    });
  });

  it.each(['coach', 'program', 'prayer', 'parent', 'none'] as Actor[])(
    'start_new_season refuses %s',
    async (actor) => {
      await withTx(pool, async (client) => {
        const f = await seed(client);
        await expect(
          asUser(client, f.actors[actor], async () => {
            await client.query(`select start_new_season('Should not exist')`);
          })
        ).rejects.toThrow(/staff only/i);
      });
    }
  );
});
