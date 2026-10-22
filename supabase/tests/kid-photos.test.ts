/**
 * RLS + behaviour tests for kid photos (supabase/migrations/*_kid_photos.sql):
 * the `kid-photos` bucket and its storage.objects policies, `kids.photo_path`,
 * and `set_kid_photo()`.
 *
 * Photos are of minors, so what is worth pinning is who may read one (exactly
 * the readers of the kid's row), who may upload or attach one (Admin and the
 * kid's parent), that a photo can be replaced but never removed, and that the
 * two SECURITY DEFINER functions cannot be pointed at someone else's kid or
 * someone else's upload.
 *
 * storage.objects rows are inserted directly as the superuser, because the
 * Storage API is not part of what these tests exercise: the policies are. The
 * API's own deletes go through storage.protect_delete(), which refuses direct
 * deletes unless `storage.allow_delete_query` is set -- the DELETE tests set it
 * so the policy, not the trigger, is what decides.
 *
 * Run with `npm run test:db` (requires `npx supabase start`).
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

type Actor = 'admin' | 'program' | 'coach' | 'prayer' | 'parent' | 'none';

interface Fixture {
  actors: Record<Actor, string>;
  /** A coach whose team does not include the kid. */
  otherCoachId: string;
  /** A parent with a different kid. */
  otherParentId: string;
  teamId: string;
  kidId: string;
}

const newName = (ext: 'webp' | 'jpg' = 'webp') => `${randomUUID()}.${ext}`;

/**
 * One user per actor, a kid linked to `parent` and on `coach`'s team, and a
 * second parent. Everything is created as superuser; the kid starts with no
 * photo.
 */
async function seed(client: PoolClient): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const actors = {} as Record<Actor, string>;
  for (const actor of ['admin', 'program', 'coach', 'prayer', 'parent', 'none'] as Actor[]) {
    actors[actor] = await createProfile(client, { email: `kp-${actor}-${suffix}@test.local` });
    if (actor !== 'none') await grantRole(client, actors[actor], actor);
  }
  const otherCoachId = await createProfile(client, { email: `kp-other-coach-${suffix}@test.local` });
  await grantRole(client, otherCoachId, 'coach');
  const otherParentId = await createProfile(client, { email: `kp-other-parent-${suffix}@test.local` });
  await grantRole(client, otherParentId, 'parent');

  const team = await client.query<{ id: string }>(
    `insert into ministry_teams (name, division) values ('Photo Team','juniors') returning id`
  );
  const teamId = team.rows[0].id;
  await client.query('insert into team_coaches (team_id, user_id) values ($1,$2)', [
    teamId,
    actors.coach,
  ]);

  const kidId = await createKid(client, actors.parent);
  const season = await client.query<{ id: string }>('select id from seasons where is_current limit 1');
  await client.query(
    `insert into registrations (kid_id, season_id, grade, division, tshirt_size, team_id)
     values ($1,$2,5,'juniors','M',$3)`,
    [kidId, season.rows[0].id, teamId]
  );

  return { actors, otherCoachId, otherParentId, teamId, kidId };
}

let kidSeq = 0;

async function createKid(client: PoolClient, parentUserId: string | null): Promise<string> {
  kidSeq += 1;
  const r = await client.query<{ id: string }>(
    `insert into kids (
       first_name, last_name, dob, gender, home_address,
       emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email, parent_user_id
     ) values ($1,$2,'2014-05-05','female','12 Test St','EC','555-0100',
               'Guardian','555-0101','guardian@test.local',$3)
     returning id`,
    [`PhotoKid${kidSeq}`, `Last${kidSeq}`, parentUserId]
  );
  return r.rows[0].id;
}

/** An uploaded object, as the Storage API would leave it. */
async function putObject(client: PoolClient, name: string, ownerId: string): Promise<string> {
  await client.query(
    `insert into storage.objects (bucket_id, name, owner_id) values ('kid-photos', $1, $2)`,
    [name, ownerId]
  );
  return name;
}

/** Points a kid at an object as superuser, bypassing the functions. */
async function attachDirect(client: PoolClient, kidId: string, name: string): Promise<void> {
  await client.query(
    'update kids set photo_path = $1, photo_updated_at = now() where id = $2',
    [name, kidId]
  );
}

/** A kid whose photo was uploaded by `uploaderId` and attached directly. */
async function kidWithPhoto(
  client: PoolClient,
  f: Fixture,
  uploaderId = f.actors.parent
): Promise<string> {
  const name = await putObject(client, newName(), uploaderId);
  await attachDirect(client, f.kidId, name);
  return name;
}

/** Whether `userId` can see the object, under RLS. */
async function canRead(client: PoolClient, userId: string, name: string): Promise<boolean> {
  return asUser(client, userId, async () => {
    const r = await client.query(
      `select 1 from storage.objects where bucket_id = 'kid-photos' and name = $1`,
      [name]
    );
    return r.rowCount === 1;
  });
}

async function setPhoto(
  client: PoolClient,
  userId: string,
  kidId: string,
  path: string | null
): Promise<string | null> {
  return asUser(client, userId, async () => {
    const r = await client.query<{ set_kid_photo: string | null }>(
      'select set_kid_photo($1::uuid, $2) as set_kid_photo',
      [kidId, path]
    );
    return r.rows[0].set_kid_photo;
  });
}

/** Runs `fn` expecting a Postgres error, and returns it. */
async function pgError(
  client: PoolClient,
  fn: () => Promise<unknown>
): Promise<{ code?: string; message: string }> {
  await client.query('SAVEPOINT expect_error');
  try {
    await fn();
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT expect_error');
    return err as { code?: string; message: string };
  }
  await client.query('RELEASE SAVEPOINT expect_error');
  throw new Error('expected the statement to be rejected, but it succeeded');
}

/** Runs `fn` as a database role that is not a signed-in user (`anon`, `service_role`). */
async function asDbRole<T>(client: PoolClient, role: 'anon' | 'service_role', fn: () => Promise<T>): Promise<T> {
  await client.query('SAVEPOINT as_db_role');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await fn();
    await client.query('RELEASE SAVEPOINT as_db_role');
    await client.query('RESET ROLE');
    return result;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT as_db_role');
    throw err;
  }
}

const asAnon = <T>(client: PoolClient, fn: () => Promise<T>) => asDbRole(client, 'anon', fn);

const READS: Actor[] = ['admin', 'program', 'coach', 'parent'];
const DENIED: Actor[] = ['prayer', 'none'];

describe('kid photos -- schema', () => {
  it('has a private bucket with Storage-enforced size and type limits', async () => {
    await withTx(pool, async (client) => {
      const r = await client.query(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'kid-photos'`
      );
      expect(r.rows[0]).toEqual({
        public: false,
        // bigint comes back from pg as a string
        file_size_limit: '2097152',
        allowed_mime_types: ['image/webp', 'image/jpeg'],
      });
    });
  });

  it('keeps photo_path unique across kids', async () => {
    await withTx(pool, async (client) => {
      const a = await createKid(client, null);
      const b = await createKid(client, null);
      const name = newName();
      await attachDirect(client, a, name);

      const err = await pgError(client, () => attachDirect(client, b, name));
      expect(err.message).toMatch(/kids_photo_path_key/);
    });
  });

  it.each(['photo.webp', `folder/${randomUUID()}.webp`, `${randomUUID()}.png`, `${randomUUID()}.heic`])(
    'rejects the photo_path %s',
    async (bad) => {
      await withTx(pool, async (client) => {
        const kid = await createKid(client, null);
        const err = await pgError(client, () => attachDirect(client, kid, bad));
        expect(err.message).toMatch(/kids_photo_path_format/);
      });
    }
  );

  it('keeps photo_path and photo_updated_at together', async () => {
    await withTx(pool, async (client) => {
      const kid = await createKid(client, null);
      const err = await pgError(client, () =>
        client.query('update kids set photo_path = $1 where id = $2', [newName(), kid])
      );
      expect(err.message).toMatch(/kids_photo_pair/);
    });
  });

  it('accepts a JPEG fallback name', async () => {
    await withTx(pool, async (client) => {
      const kid = await createKid(client, null);
      await attachDirect(client, kid, newName('jpg'));
      const r = await client.query('select photo_path from kids where id = $1', [kid]);
      expect(r.rows[0].photo_path).toMatch(/\.jpg$/);
    });
  });

  it('is not part of the archived attendance roster', async () => {
    await withTx(pool, async (client) => {
      const r = await client.query<{ result: string }>(
        `select pg_get_function_result('public.attendance_day_roster(uuid)'::regprocedure) as result`
      );
      expect(r.rows[0].result).not.toMatch(/photo/i);
    });
  });
});

describe('kid photos -- who can read a photo', () => {
  it.each(READS)('lets %s read the photo of a kid they can read', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await kidWithPhoto(client, f);
      expect(await canRead(client, f.actors[actor], name)).toBe(true);
    });
  });

  it.each(DENIED)('does not let %s read it', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await kidWithPhoto(client, f);
      expect(await canRead(client, f.actors[actor], name)).toBe(false);
    });
  });

  it("does not let a coach of another team or another family's parent read it", async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await kidWithPhoto(client, f);
      expect(await canRead(client, f.otherCoachId, name)).toBe(false);
      expect(await canRead(client, f.otherParentId, name)).toBe(false);
    });
  });

  it('stops a coach reading once they are taken off the kid’s team', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await kidWithPhoto(client, f);
      expect(await canRead(client, f.actors.coach, name)).toBe(true);

      await client.query('delete from team_coaches where team_id = $1', [f.teamId]);

      expect(await canRead(client, f.actors.coach, name)).toBe(false);
    });
  });

  it('stops a coach reading when the kid moves to another team', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await kidWithPhoto(client, f);

      await client.query('update registrations set team_id = null where kid_id = $1', [f.kidId]);

      expect(await canRead(client, f.actors.coach, name)).toBe(false);
    });
  });

  it('follows the kid when an Admin hands them to another parent', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      // The first parent uploaded it; the kid is then reassigned.
      const name = await kidWithPhoto(client, f, f.actors.parent);
      await client.query('update kids set parent_user_id = $1 where id = $2', [
        f.otherParentId,
        f.kidId,
      ]);

      expect(await canRead(client, f.otherParentId, name)).toBe(true);
      // Being the uploader no longer helps once a kid references the object.
      expect(await canRead(client, f.actors.parent, name)).toBe(false);
    });
  });

  it('lets an uploader preview an object no kid uses yet, and nobody else but Admin', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);

      expect(await canRead(client, f.actors.parent, name)).toBe(true);
      expect(await canRead(client, f.actors.admin, name)).toBe(true);
      expect(await canRead(client, f.otherParentId, name)).toBe(false);
      expect(await canRead(client, f.actors.coach, name)).toBe(false);
      expect(await canRead(client, f.actors.program, name)).toBe(false);
      expect(await canRead(client, f.actors.prayer, name)).toBe(false);
    });
  });

  it('hides a replaced photo from the people who could see the kid', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const oldName = await kidWithPhoto(client, f, f.actors.admin);
      const newObject = await putObject(client, newName(), f.actors.parent);

      expect(await canRead(client, f.actors.coach, oldName)).toBe(true);
      await setPhoto(client, f.actors.parent, f.kidId, newObject);

      expect(await canRead(client, f.actors.coach, oldName)).toBe(false);
      expect(await canRead(client, f.actors.program, oldName)).toBe(false);
      expect(await canRead(client, f.actors.coach, newObject)).toBe(true);
    });
  });
});

describe('kid photos -- who can upload', () => {
  const insertAs = (client: PoolClient, userId: string, name: string, ownerId = userId) =>
    asUser(client, userId, () =>
      client.query(
        `insert into storage.objects (bucket_id, name, owner_id) values ('kid-photos', $1, $2)`,
        [name, ownerId]
      )
    );

  it.each(['admin', 'parent'] as Actor[])('lets %s upload under a random name', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await expect(insertAs(client, f.actors[actor], newName())).resolves.toBeDefined();
      await expect(insertAs(client, f.actors[actor], newName('jpg'))).resolves.toBeDefined();
    });
  });

  it.each(['program', 'coach', 'prayer', 'none'] as Actor[])('refuses %s', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const err = await pgError(client, () => insertAs(client, f.actors[actor], newName()));
      expect(err.message).toMatch(/row-level security/i);
    });
  });

  it('refuses an object recorded as someone else’s upload', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const err = await pgError(client, () =>
        insertAs(client, f.actors.parent, newName(), f.otherParentId)
      );
      expect(err.message).toMatch(/row-level security/i);
    });
  });

  it.each([
    'photo.webp',
    `folder/${randomUUID()}.webp`,
    `${randomUUID()}.png`,
    `${randomUUID()}.heic`,
    `${randomUUID()}.webp.exe`,
  ])('refuses the object name %s', async (bad) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const err = await pgError(client, () => insertAs(client, f.actors.parent, bad));
      expect(err.message).toMatch(/row-level security/i);
    });
  });

  it('has no update policy, so an upload can never be overwritten or renamed', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);
      const target = newName();

      for (const actor of ['parent', 'admin'] as Actor[]) {
        const r = await asUser(client, f.actors[actor], () =>
          client.query(
            `update storage.objects set name = $1 where bucket_id = 'kid-photos' and name = $2`,
            [target, name]
          )
        );
        expect(r.rowCount).toBe(0);
      }
    });
  });
});

describe('kid photos -- a photo can be replaced but never removed', () => {
  /** Deletes as `userId`, past the trigger that blocks direct deletes. */
  const deleteAs = (client: PoolClient, userId: string, name: string) =>
    asUser(client, userId, async () => {
      await client.query(`select set_config('storage.allow_delete_query', 'true', true)`);
      const r = await client.query(
        `delete from storage.objects where bucket_id = 'kid-photos' and name = $1`,
        [name]
      );
      return r.rowCount;
    });

  it('lets an uploader delete their own object once no kid uses it', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);
      expect(await deleteAs(client, f.actors.parent, name)).toBe(1);
    });
  });

  it('lets an Admin delete an unreferenced object someone else uploaded', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);
      expect(await deleteAs(client, f.actors.admin, name)).toBe(1);
    });
  });

  it('refuses everyone while a kid still uses the object', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await kidWithPhoto(client, f, f.actors.admin);

      for (const actor of ['admin', 'parent', 'program', 'coach'] as Actor[]) {
        expect(await deleteAs(client, f.actors[actor], name)).toBe(0);
      }
      const r = await client.query(`select 1 from storage.objects where name = $1`, [name]);
      expect(r.rowCount).toBe(1);
    });
  });

  it('refuses people who neither uploaded the object nor are Admin', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);

      for (const id of [f.otherParentId, f.actors.coach, f.actors.program, f.actors.prayer]) {
        expect(await deleteAs(client, id, name)).toBe(0);
      }
    });
  });

  it('lets the replaced photo be deleted once set_kid_photo has swapped it out', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const first = await putObject(client, newName(), f.actors.parent);
      const second = await putObject(client, newName(), f.actors.parent);

      await setPhoto(client, f.actors.parent, f.kidId, first);
      const old = await setPhoto(client, f.actors.parent, f.kidId, second);

      expect(old).toBe(first);
      expect(await deleteAs(client, f.actors.parent, first)).toBe(1);
      expect(await deleteAs(client, f.actors.parent, second)).toBe(0);
    });
  });
});

describe('set_kid_photo -- authorisation', () => {
  it('lets a parent attach a photo to their own kid', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);

      const old = await setPhoto(client, f.actors.parent, f.kidId, name);

      expect(old).toBeNull();
      const r = await client.query('select photo_path, photo_updated_at from kids where id = $1', [f.kidId]);
      expect(r.rows[0].photo_path).toBe(name);
      expect(r.rows[0].photo_updated_at).not.toBeNull();
    });
  });

  it('works while the kid’s registration is on a team', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const onTeam = await client.query('select 1 from registrations where kid_id = $1 and team_id is not null', [f.kidId]);
      expect(onTeam.rowCount).toBe(1);

      const name = await putObject(client, newName(), f.actors.parent);
      await expect(setPhoto(client, f.actors.parent, f.kidId, name)).resolves.toBeNull();
    });
  });

  it('lets an Admin attach a photo to any kid', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.admin);

      await setPhoto(client, f.actors.admin, f.kidId, name);

      const r = await client.query('select photo_path from kids where id = $1', [f.kidId]);
      expect(r.rows[0].photo_path).toBe(name);
    });
  });

  it.each(['program', 'coach', 'prayer', 'none'] as Actor[])('refuses %s', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors[actor]);

      const err = await pgError(client, () => setPhoto(client, f.actors[actor], f.kidId, name));
      expect(err.code).toBe('42501');
      const r = await client.query('select photo_path from kids where id = $1', [f.kidId]);
      expect(r.rows[0].photo_path).toBeNull();
    });
  });

  it('refuses another family’s parent, with the same error as a kid that does not exist', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.otherParentId);

      const notTheirs = await pgError(client, () => setPhoto(client, f.otherParentId, f.kidId, name));
      const missing = await pgError(client, () => setPhoto(client, f.otherParentId, randomUUID(), name));

      expect(notTheirs.code).toBe('42501');
      expect(missing.code).toBe('42501');
      expect(notTheirs.message).toBe(missing.message);
    });
  });

  it('refuses a linked parent who no longer holds the Parent role', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);
      await client.query(`delete from user_roles where user_id = $1 and role = 'parent'`, [f.actors.parent]);

      const err = await pgError(client, () => setPhoto(client, f.actors.parent, f.kidId, name));
      expect(err.code).toBe('42501');
    });
  });

  it('cannot be called without signing in, and attach_kid_photo is not callable at all', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);

      const anon = await pgError(client, () =>
        asAnon(client, () => client.query('select set_kid_photo($1::uuid, $2)', [f.kidId, name]))
      );
      expect(anon.code).toBe('42501');

      const internal = await pgError(client, () =>
        asUser(client, f.actors.admin, () =>
          client.query('select attach_kid_photo($1::uuid, $2)', [f.kidId, name])
        )
      );
      expect(internal.code).toBe('42501');
    });
  });
});

describe('set_kid_photo -- validating the upload', () => {
  it('refuses an object that was never uploaded', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const err = await pgError(client, () => setPhoto(client, f.actors.parent, f.kidId, newName()));
      expect(err.code).toBe('02000');
    });
  });

  it('refuses someone else’s upload, with the same error as a missing one', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const theirs = await putObject(client, newName(), f.otherParentId);

      const stolen = await pgError(client, () => setPhoto(client, f.actors.parent, f.kidId, theirs));
      const missing = await pgError(client, () => setPhoto(client, f.actors.parent, f.kidId, newName()));

      expect(stolen.code).toBe('02000');
      expect(stolen.message).toBe(missing.message);
    });
  });

  it('refuses an Admin attaching an upload that is not theirs', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const parents = await putObject(client, newName(), f.actors.parent);

      const err = await pgError(client, () => setPhoto(client, f.actors.admin, f.kidId, parents));
      expect(err.code).toBe('02000');
    });
  });

  it.each([null, 'photo.webp', `folder/${randomUUID()}.webp`, `${randomUUID()}.png`])(
    'refuses the path %s',
    async (bad) => {
      await withTx(pool, async (client) => {
        const f = await seed(client);
        const err = await pgError(client, () => setPhoto(client, f.actors.parent, f.kidId, bad));
        expect(err.code).toBe('02000');
      });
    }
  );

  it('refuses a photo another kid already uses', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const siblingId = await createKid(client, f.actors.parent);
      const name = await putObject(client, newName(), f.actors.parent);
      await setPhoto(client, f.actors.parent, f.kidId, name);

      const err = await pgError(client, () => setPhoto(client, f.actors.parent, siblingId, name));
      expect(err.code).toBe('23505');
    });
  });

  it('ignores an object in another bucket with the same name', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await client.query(
        `insert into storage.buckets (id, name, public) values ('other-bucket','other-bucket', false)`
      );
      const name = newName();
      await client.query(
        `insert into storage.objects (bucket_id, name, owner_id) values ('other-bucket', $1, $2)`,
        [name, f.actors.parent]
      );

      const err = await pgError(client, () => setPhoto(client, f.actors.parent, f.kidId, name));
      expect(err.code).toBe('02000');
    });
  });
});

describe('set_kid_photo -- replacing', () => {
  it('returns the path it replaced so the old file can be deleted', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const first = await putObject(client, newName(), f.actors.parent);
      const second = await putObject(client, newName(), f.actors.parent);

      await setPhoto(client, f.actors.parent, f.kidId, first);
      const replaced = await setPhoto(client, f.actors.parent, f.kidId, second);

      expect(replaced).toBe(first);
      const r = await client.query('select photo_path from kids where id = $1', [f.kidId]);
      expect(r.rows[0].photo_path).toBe(second);
    });
  });

  it('lets a parent replace a photo an Admin uploaded', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const adminsPhoto = await kidWithPhoto(client, f, f.actors.admin);
      const next = await putObject(client, newName(), f.actors.parent);

      const replaced = await setPhoto(client, f.actors.parent, f.kidId, next);

      expect(replaced).toBe(adminsPhoto);
    });
  });

  it('is a no-op when asked to attach the photo the kid already has', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors.parent);
      await setPhoto(client, f.actors.parent, f.kidId, name);
      await client.query(`update kids set photo_updated_at = '2020-01-01' where id = $1`, [f.kidId]);

      const replaced = await setPhoto(client, f.actors.parent, f.kidId, name);

      expect(replaced).toBeNull();
      const r = await client.query('select photo_updated_at from kids where id = $1', [f.kidId]);
      expect(new Date(r.rows[0].photo_updated_at).getUTCFullYear()).toBe(2020);
    });
  });

  it('refreshes photo_updated_at on a replacement', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const first = await putObject(client, newName(), f.actors.parent);
      await setPhoto(client, f.actors.parent, f.kidId, first);
      await client.query(`update kids set photo_updated_at = '2020-01-01' where id = $1`, [f.kidId]);

      const second = await putObject(client, newName(), f.actors.parent);
      await setPhoto(client, f.actors.parent, f.kidId, second);

      const r = await client.query('select photo_updated_at from kids where id = $1', [f.kidId]);
      expect(new Date(r.rows[0].photo_updated_at).getUTCFullYear()).toBeGreaterThan(2020);
    });
  });
});

describe('kids.photo_path -- no other way to write it', () => {
  it.each(['parent', 'program', 'coach', 'prayer'] as Actor[])('does not let %s update it directly', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await putObject(client, newName(), f.actors[actor]);

      const r = await asUser(client, f.actors[actor], () =>
        client.query(
          'update kids set photo_path = $1, photo_updated_at = now() where id = $2',
          [name, f.kidId]
        )
      );

      expect(r.rowCount).toBe(0);
      const after = await client.query('select photo_path from kids where id = $1', [f.kidId]);
      expect(after.rows[0].photo_path).toBeNull();
    });
  });
});

describe('kid_photo_attached', () => {
  it('cannot be called without signing in', async () => {
    await withTx(pool, async (client) => {
      const err = await pgError(client, () =>
        asAnon(client, () => client.query('select kid_photo_attached($1)', [newName()]))
      );
      expect(err.code).toBe('42501');
    });
  });

  it('answers for every kid, not only the ones the caller can read', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const name = await kidWithPhoto(client, f);

      const seen = await asUser(client, f.otherParentId, async () => {
        const r = await client.query<{ attached: boolean }>(
          'select kid_photo_attached($1) as attached',
          [name]
        );
        return r.rows[0].attached;
      });

      expect(seen).toBe(true);
    });
  });
});

describe('kid_photo_orphans -- what the daily cleanup deletes', () => {
  const putOld = async (client: PoolClient, name: string, ownerId: string, age = '2 days') => {
    await client.query(
      `insert into storage.objects (bucket_id, name, owner_id, created_at)
       values ('kid-photos', $1, $2, now() - $3::interval)`,
      [name, ownerId, age]
    );
    return name;
  };

  const orphans = (client: PoolClient, ...args: unknown[]) =>
    asDbRole(client, 'service_role', async () => {
      const r = await client.query<{ name: string }>(
        args.length ? 'select name from kid_photo_orphans($1::interval)' : 'select name from kid_photo_orphans()',
        args
      );
      return r.rows.map((row) => row.name);
    });

  it('lists an old upload that no kid uses', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const abandoned = await putOld(client, newName(), f.actors.parent);

      expect(await orphans(client)).toContain(abandoned);
    });
  });

  it('lists a photo that was replaced', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const first = await putOld(client, newName(), f.actors.admin);
      const second = await putObject(client, newName(), f.actors.parent);
      await attachDirect(client, f.kidId, first);
      await setPhoto(client, f.actors.parent, f.kidId, second);

      const found = await orphans(client);

      expect(found).toContain(first);
      expect(found).not.toContain(second);
    });
  });

  it('never lists a photo a kid uses, however old', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const inUse = await putOld(client, newName(), f.actors.parent, '400 days');
      await attachDirect(client, f.kidId, inUse);

      expect(await orphans(client)).not.toContain(inUse);
    });
  });

  it('leaves a recent upload alone, in case its form is still open', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      const recent = await putOld(client, newName(), f.actors.parent, '1 hour');

      expect(await orphans(client)).not.toContain(recent);
      expect(await orphans(client, '30 minutes')).toContain(recent);
    });
  });

  it('only looks in the kid-photos bucket', async () => {
    await withTx(pool, async (client) => {
      const f = await seed(client);
      await client.query(`insert into storage.buckets (id, name, public) values ('other-bucket','other-bucket', false)`);
      const name = newName();
      await client.query(
        `insert into storage.objects (bucket_id, name, owner_id, created_at)
         values ('other-bucket', $1, $2, now() - interval '2 days')`,
        [name, f.actors.parent]
      );

      expect(await orphans(client)).not.toContain(name);
    });
  });

  it.each(['admin', 'parent', 'program'] as Actor[])('is not callable by a signed-in %s', async (actor) => {
    await withTx(pool, async (client) => {
      const f = await seed(client);

      const err = await pgError(client, () =>
        asUser(client, f.actors[actor], () => client.query('select name from kid_photo_orphans()'))
      );

      expect(err.code).toBe('42501');
    });
  });

  it('is not callable without signing in', async () => {
    await withTx(pool, async (client) => {
      const err = await pgError(client, () =>
        asAnon(client, () => client.query('select name from kid_photo_orphans()'))
      );

      expect(err.code).toBe('42501');
    });
  });
});
