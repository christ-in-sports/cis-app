/**
 * RLS and function-gate tests for the attendance and season objects rewritten in
 * the roles cleanup (supabase/migrations/20261021025854_roles_cleanup.sql, ENG-16).
 *
 * Before that migration these were gated by is_staff() (admin) and is_coach()
 * (admin or coach). They now name the roles directly, and this file pins the
 * behaviour so it cannot drift: Admin everything, Coach read plus marking their
 * own team. Program manages setup and reads results; Prayer, Parents and
 * users with no role have no access. Role-based access control is non-negotiable coverage
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

const ALLOWED_TO_READ: Actor[] = ['admin', 'program', 'coach'];
const DENIED_TO_READ: Actor[] = ['prayer', 'parent', 'none'];

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

  it.each(['coach', 'prayer', 'parent', 'none'] as Actor[])('%s cannot assign a coach to a team', async (actor) => {
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
      ).rejects.toThrow(/Admin, Program or Coach only/i);
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


describe('team attendance workflow', () => {
  it('Program creates a session and snapshots registrations atomically', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await client.query('update seasons set is_current = false where is_current');
      await client.query('update seasons set is_current = true where id = $1', [f.seasonId]);
      const dayId = await asUser(client, f.actors.program, async () => {
        const result = await client.query('select create_attendance_day($1, current_date, $2, $3) as id', [f.seasonId, 'Sunday practice', 'juniors']);
        return result.rows[0].id;
      });
      expect((await client.query('select registration_id from attendance_records where day_id = $1', [dayId])).rows).toEqual([{ registration_id: f.registrationId }]);
      // Re-populating never overwrites a coach's mark.
      await asUser(client, f.actors.coach, () => client.query("update attendance_records set status = 'late', note = 'Arrived at warmup' where day_id = $1", [dayId]));
      await asUser(client, f.actors.program, () => client.query('select populate_attendance_day($1)', [dayId]));
      expect((await client.query('select status, note, marked_by from attendance_records where day_id = $1', [dayId])).rows[0]).toMatchObject({ status: 'late', note: 'Arrived at warmup', marked_by: f.actors.coach });
    });
  });

  it('only assigned coaches can read records or definer summaries', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await countAs(client, f.otherCoachId, 'select id from attendance_records where day_id = $1', [f.dayId])).toBe(0);
      expect(await countAs(client, f.otherCoachId, 'select * from attendance_summary($1)', [f.seasonId])).toBe(0);
      await client.query('insert into team_coaches(team_id, user_id) values ($1, $2)', [f.teamId, f.otherCoachId]);
      expect(await countAs(client, f.otherCoachId, 'select id from attendance_records where day_id = $1', [f.dayId])).toBe(1);
      await client.query("delete from user_roles where user_id = $1 and role = 'coach'", [f.otherCoachId]);
      expect(await countAs(client, f.otherCoachId, 'select id from attendance_records where day_id = $1', [f.dayId])).toBe(0);
      expect(await countAs(client, f.otherCoachId, "update attendance_records set status = 'present' where day_id = $1", [f.dayId])).toBe(0);
    });
  });

  it('locks are enforced for direct writes, including Admin', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await asUser(client, f.actors.program, () => client.query('update attendance_days set locked = true where id = $1', [f.dayId]));
      for (const actor of ['admin', 'coach'] as Actor[]) {
        await expect(asUser(client, f.actors[actor], () => client.query("update attendance_records set status = 'present' where day_id = $1", [f.dayId]))).rejects.toThrow(/locked/i);
      }
      await expect(asUser(client, f.actors.program, () => client.query('select populate_attendance_day($1)', [f.dayId]))).rejects.toThrow(/locked/i);
    });
  });

  it('rejects moving a mark to another day', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(asUser(client, f.actors.admin, () => client.query('update attendance_records set day_id = $1 where day_id = $2', [randomUUID(), f.dayId]))).rejects.toThrow(/identity/i);
    });
  });

  it('Program assigns teams through the narrow RPC and cannot edit kid registrations', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await client.query('update seasons set is_current = false where is_current');
      await client.query('update seasons set is_current = true where id = $1', [f.seasonId]);
      await asUser(client, f.actors.program, () => client.query('select assign_attendance_team($1, null)', [[f.registrationId]]));
      await asUser(client, f.actors.program, () => client.query('select assign_attendance_team($1, $2)', [[f.registrationId], f.teamId]));
      expect(await countAs(client, f.actors.program, 'update registrations set grade = 6 where id = $1', [f.registrationId])).toBe(0);
      const other = await client.query("insert into ministry_teams(name, division, season_id) values ('Other division', 'ambassadors', $1) returning id", [f.seasonId]);
      await expect(asUser(client, f.actors.program, () => client.query('select assign_attendance_team($1, $2)', [[f.registrationId], other.rows[0].id]))).rejects.toThrow(/same roster and division/i);
      const otherSeason = await client.query("insert into seasons(name) values ($1) returning id", [randomUUID()]);
      const otherTeam = await client.query("insert into ministry_teams(name, division, season_id) values ('Other season', 'juniors', $1) returning id", [otherSeason.rows[0].id]);
      await expect(asUser(client, f.actors.program, () => client.query('select assign_attendance_team($1, $2)', [[f.registrationId], otherTeam.rows[0].id]))).rejects.toThrow(/same roster and division/i);
    });
  });

  it.each(['coach', 'prayer', 'parent', 'none'] as Actor[])('%s cannot create sessions or assign kids', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(asUser(client, f.actors[actor], () => client.query('select create_attendance_day($1, current_date, $2, null)', [f.seasonId, 'Not allowed']))).rejects.toThrow(/Admin or Program only/i);
      await expect(asUser(client, f.actors[actor], () => client.query('select assign_attendance_team($1, $2)', [[f.registrationId], f.teamId]))).rejects.toThrow(/Admin or Program only/i);
      expect(await countAs(client, f.actors[actor], 'select * from attendance_coach_options()')).toBe(0);
    });
  });

  it('Program can pick coaches without receiving their emails or all profiles', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await asUser(client, f.actors.program, async () => {
        const result = await client.query('select * from attendance_coach_options() where id = $1', [f.actors.coach]);
        expect(result.rows).toHaveLength(1);
        expect(Object.keys(result.rows[0]).sort()).toEqual(['display_name', 'id']);
      });
      expect(await countAs(client, f.actors.program, 'select id from profiles where id = $1', [f.actors.coach])).toBe(0);
      await expect(asUser(client, f.actors.program, () => client.query('insert into team_coaches(team_id, user_id) values ($1, $2)', [f.teamId, f.actors.parent]))).rejects.toThrow(/Coach role/i);
    });
  });
});


describe('attendance function execution privileges', () => {
  const rpcSignatures = [
    'attendance_coach_options()', 'assign_attendance_team(uuid[],uuid)',
    'create_attendance_day(uuid,date,text,text)', 'attendance_session_overview(uuid)',
    'can_mark(uuid)', 'attendance_summary(uuid)', 'populate_attendance_day(uuid)',
    'start_new_season(text)', 'attendance_roster_season()', 'create_attendance_date(date)',
    'archive_current_attendance()', 'attendance_days_overview(boolean)', 'attendance_archive_summary(boolean)',
    'can_access_attendance_record(uuid,uuid)', 'delete_attendance_team(uuid)', 'attendance_day_roster(uuid)', 'archived_attendance_team_roster()',
  ];
  it.each(rpcSignatures)('%s requires authentication', async (signature) => {
    const result = await pool.query(
      `select has_function_privilege('anon', $1, 'EXECUTE') as anonymous,
              has_function_privilege('authenticated', $1, 'EXECUTE') as signed_in`,
      [`public.${signature}`]
    );
    expect(result.rows[0]).toEqual({ anonymous: false, signed_in: true });
  });
  it.each(['guard_attendance_mark()', 'guard_attendance_scope()', 'guard_attendance_coach()', 'guard_attendance_day_identity()', 'guard_frozen_attendance_roster()'])(
    '%s cannot be called directly by API users', async (signature) => {
      const result = await pool.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anonymous,
                has_function_privilege('authenticated', $1, 'EXECUTE') as signed_in`,
        [`public.${signature}`]
      );
      expect(result.rows[0]).toEqual({ anonymous: false, signed_in: false });
    }
  );
});


describe('simple attendance days and archive', () => {
  it('archives teams, allows fresh teams with reused names, and keeps historical coach access scoped', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await client.query('update seasons set is_current=false where is_current');
      await client.query('update seasons set is_current=true where id=$1', [f.seasonId]);
      await asUser(client, f.actors.coach, () => client.query("update attendance_records set status='present',note='Original mark' where day_id=$1", [f.dayId]));
      await asUser(client, f.actors.program, () => client.query('select archive_current_attendance()'));
      const fresh = (await client.query("insert into ministry_teams(name,division,season_id) values ('Roles Team','juniors',$1) returning id", [f.seasonId])).rows[0].id;
      expect(await countAs(client, f.actors.coach, 'select id from attendance_team_snapshots where team_id=$1', [f.teamId])).toBe(2);
      expect(await countAs(client, f.otherCoachId, 'select id from attendance_team_snapshots where team_id=$1', [f.teamId])).toBe(0);
      await client.query('insert into team_coaches(team_id,user_id) values ($1,$2)', [fresh, f.otherCoachId]);
      await asUser(client, f.actors.program, () => client.query('select assign_attendance_team($1,$2)', [[f.registrationId], fresh]));
      const newDay = (await asUser(client, f.actors.program, () => client.query('select create_attendance_date(current_date+1) as id'))).rows[0].id;
      await asUser(client, f.actors.coach, async () => {
        expect((await client.query('select team_id,status,note from attendance_day_roster($1)', [f.dayId])).rows).toEqual([{ team_id: f.teamId, status: 'present', note: 'Original mark' }]);
        expect((await client.query('select team_id from attendance_archive_summary(true) where registration_id=$1', [f.registrationId])).rows).toEqual([{ team_id: f.teamId }]);
      });
      expect(await countAs(client, f.actors.coach, 'select id from attendance_records where day_id=$1', [newDay])).toBe(0);
      expect(await countAs(client, f.actors.coach, 'select id from registrations where id=$1', [f.registrationId])).toBe(0);
      expect(await countAs(client, f.otherCoachId, 'select * from attendance_day_roster($1)', [f.dayId])).toBe(0);
      expect(await countAs(client, f.otherCoachId, 'select * from attendance_archive_summary(true) where registration_id=$1', [f.registrationId])).toBe(0);
      expect(await countAs(client, f.otherCoachId, 'select * from attendance_day_roster($1)', [newDay])).toBe(1);
      await asUser(client, f.actors.program, () => client.query('update attendance_days set archived_at=null,locked=false where id=$1', [f.dayId]));
      expect(await countAs(client, f.actors.coach, "update attendance_records set status='late' where day_id=$1 returning id", [f.dayId])).toBe(1);
      expect(await countAs(client, f.otherCoachId, "update attendance_records set status='absent' where day_id=$1 returning id", [f.dayId])).toBe(0);
      await expect(asUser(client, f.actors.program, () => client.query('select populate_attendance_day($1)', [f.dayId]))).rejects.toThrow(/Archived rosters/i);
      await asUser(client, f.actors.program, () => client.query('select archive_current_attendance()'));
      expect((await client.query('select team_id from attendance_team_snapshots where day_id=$1', [f.dayId])).rows[0].team_id).toBe(f.teamId);
      await client.query("delete from user_roles where user_id=$1 and role='coach'", [f.actors.coach]);
      expect(await countAs(client, f.actors.coach, 'select * from attendance_day_roster($1)', [f.dayId])).toBe(0);
    });
  });

  it.each([false, true])('keeps archived team rosters when attendance days exist: %s, even after deletion', async (hasDay) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      if (!hasDay) await client.query('delete from attendance_days where id=$1', [f.dayId]);
      await asUser(client, f.actors.program, () => client.query('select archive_current_attendance()'));
      if (hasDay) await client.query('delete from attendance_days where id=$1', [f.dayId]);
      await asUser(client, f.actors.program, async () => {
        expect((await client.query('select id,team_id from archived_attendance_team_roster() where team_id=$1', [f.teamId])).rows).toEqual([{ id: f.registrationId, team_id: f.teamId }]);
      });
      expect(await countAs(client, f.actors.coach, 'select * from archived_attendance_team_roster()')).toBe(0);
      await expect(asUser(client, f.actors.program, () => client.query('insert into attendance_team_snapshots(registration_id,team_id) values ($1,$2)', [f.registrationId, f.teamId]))).rejects.toThrow(/permission denied/i);
    });
  });

  it('lets Program rename/delete a current team while preserving kids and attendance', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await countAs(client, f.actors.program, "update ministry_teams set name='Renamed team' where id=$1 returning id", [f.teamId])).toBe(1);
      await asUser(client, f.actors.program, () => client.query('select delete_attendance_team($1)', [f.teamId]));
      expect((await client.query('select active,deleted_at is not null as deleted from ministry_teams where id=$1', [f.teamId])).rows[0]).toEqual({ active: false, deleted: true });
      expect((await client.query('select team_id from registrations where id=$1', [f.registrationId])).rows[0].team_id).toBeNull();
      expect((await client.query('select 1 from team_coaches where team_id=$1', [f.teamId])).rowCount).toBe(0);
      expect((await client.query('select 1 from attendance_records where day_id=$1', [f.dayId])).rowCount).toBe(1);
      await expect(asUser(client, f.actors.program, () => client.query('select delete_attendance_team($1)', [f.teamId]))).rejects.toThrow(/current team/i);
    });
  });

  it.each(['coach', 'prayer', 'parent', 'none'] as Actor[])('%s cannot rename or delete teams', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await countAs(client, f.actors[actor], "update ministry_teams set name='Denied' where id=$1 returning id", [f.teamId])).toBe(0);
      await expect(asUser(client, f.actors[actor], () => client.query('select delete_attendance_team($1)', [f.teamId]))).rejects.toThrow(/Admin or Program only/i);
    });
  });

  it.each(['admin', 'program'] as Actor[])('%s deletes only the selected day and its marks, including archived days', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const other = await client.query('insert into attendance_days(group_id,date,season_id) values ($1,current_date+1,$2) returning id', [f.groupId, f.seasonId]);
      await client.query('insert into attendance_records(day_id,registration_id) values ($1,$2)', [other.rows[0].id, f.registrationId]);
      await client.query('update attendance_days set archived_at=now(),locked=true where id=$1', [f.dayId]);
      expect(await countAs(client, f.actors[actor], 'delete from attendance_days where id=$1 returning id', [f.dayId])).toBe(1);
      expect((await client.query('select id from attendance_records where day_id=$1', [f.dayId])).rowCount).toBe(0);
      expect((await client.query('select id from attendance_records where day_id=$1', [other.rows[0].id])).rowCount).toBe(1);
      expect((await client.query('select team_id from registrations where id=$1', [f.registrationId])).rows[0].team_id).toBe(f.teamId);
      expect((await client.query('select 1 from kids where id=(select kid_id from registrations where id=$1)', [f.registrationId])).rowCount).toBe(1);
      expect((await client.query('select 1 from team_coaches where team_id=$1', [f.teamId])).rowCount).toBe(1);
    });
  });

  it.each(['coach', 'prayer', 'parent', 'none'] as Actor[])('%s cannot delete attendance days', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await countAs(client, f.actors[actor], 'delete from attendance_days where id=$1 returning id', [f.dayId])).toBe(0);
      expect((await client.query('select id from attendance_records where day_id=$1', [f.dayId])).rowCount).toBe(1);
    });
  });

  it('keeps the populated roster when an empty season is made current', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await client.query('update seasons set is_current = false where is_current');
      const empty = await client.query("insert into seasons(name, is_current) values ($1,true) returning id", [randomUUID()]);
      await asUser(client, f.actors.program, async () => {
        expect((await client.query('select attendance_roster_season() as id')).rows[0].id).toBe(f.seasonId);
        const created = await client.query('select create_attendance_date(current_date + 1) as id');
        expect((await client.query('select registration_id from attendance_records where day_id = $1', [created.rows[0].id])).rows).toEqual([{ registration_id: f.registrationId }]);
        await client.query('select assign_attendance_team($1,null)', [[f.registrationId]]);
        await client.query('select assign_attendance_team($1,$2)', [[f.registrationId], f.teamId]);
      });
      expect((await client.query('select id from seasons where is_current')).rows[0].id).toBe(empty.rows[0].id);
    });
  });

  it('archives marks without changing rosters, keeps them readable, and allows restoring a day', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await asUser(client, f.actors.coach, () => client.query("update attendance_records set status='present',note='Saved attendance note' where day_id=$1", [f.dayId]));
      await asUser(client, f.actors.program, () => client.query('select archive_current_attendance()'));
      expect((await client.query('select locked,archived_at is not null as archived from attendance_days where id=$1', [f.dayId])).rows[0]).toEqual({ locked: true, archived: true });
      expect((await client.query('select team_id from registrations where id=$1', [f.registrationId])).rows[0].team_id).toBeNull();
      expect((await client.query('select active,archived_at is not null as archived from ministry_teams where id=$1', [f.teamId])).rows[0]).toEqual({ active: false, archived: true });
      expect((await client.query('select 1 from team_coaches where team_id=$1', [f.teamId])).rowCount).toBe(1);
      expect(await countAs(client, f.actors.program, 'select * from attendance_days_overview(false) where id=$1', [f.dayId])).toBe(0);
      expect(await countAs(client, f.actors.program, 'select * from attendance_days_overview(true) where id=$1', [f.dayId])).toBe(1);
      expect(await countAs(client, f.actors.coach, 'select * from attendance_archive_summary(true) where registration_id=$1', [f.registrationId])).toBe(1);
      expect(await countAs(client, f.otherCoachId, 'select * from attendance_archive_summary(true) where registration_id=$1', [f.registrationId])).toBe(0);
      expect(await countAs(client, f.actors.program, 'select * from attendance_archive_summary(false) where registration_id=$1', [f.registrationId])).toBe(0);
      await expect(asUser(client, f.actors.admin, () => client.query('update attendance_days set locked=false where id=$1', [f.dayId]))).rejects.toThrow(/archived_attendance_locked/i);
      await expect(asUser(client, f.actors.coach, () => client.query("update attendance_records set status='absent' where day_id=$1", [f.dayId]))).rejects.toThrow(/locked/i);
      await asUser(client, f.actors.program, () => client.query('update attendance_days set archived_at=null,locked=false where id=$1', [f.dayId]));
      expect((await client.query('select status,note from attendance_records where day_id=$1', [f.dayId])).rows[0]).toEqual({ status: 'present', note: 'Saved attendance note' });
      expect(await countAs(client, f.actors.program, 'select * from attendance_archive_summary(false) where registration_id=$1', [f.registrationId])).toBe(1);
    });
  });

  it.each(['coach', 'prayer', 'parent', 'none'] as Actor[])('%s cannot archive or create attendance days', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(asUser(client, f.actors[actor], () => client.query('select archive_current_attendance()'))).rejects.toThrow(/Admin or Program only/i);
      await expect(asUser(client, f.actors[actor], () => client.query('select create_attendance_date(current_date)'))).rejects.toThrow(/Admin or Program only/i);
      expect(await countAs(client, f.actors[actor], 'update attendance_days set archived_at=null,locked=false where id=$1', [f.dayId])).toBe(0);
      expect((await client.query('select archived_at from attendance_days where id=$1', [f.dayId])).rows[0].archived_at).toBeNull();
    });
  });

  it('includes days from older seasons without deleting or moving them', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      expect(await countAs(client, f.actors.program, 'select * from attendance_days_overview(false) where id=$1', [f.dayId])).toBe(1);
      expect((await client.query('select season_id from attendance_days where id=$1', [f.dayId])).rows[0].season_id).toBe(f.seasonId);
    });
  });
});
