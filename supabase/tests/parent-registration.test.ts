/**
 * RLS + behaviour tests for parent registration
 * (supabase/migrations/*_parent_registration.sql): `register_kid()`, the rule
 * that a parent sees only their own kids and that kids are never linked to a
 * parent by matching an email (`link_my_kids()` was dropped, ENG-29), and the
 * "authenticated reads current season" policy. The photo rules `register_kid()`
 * gained for kid photos are at the end of the `register_kid` tests, below.
 *
 * `register_kid()` is SECURITY DEFINER and writes records about minors, so what
 * is worth protecting is: who may call it (AGENTS.md §7), that a parent can
 * only touch their own kids, that the locked identity fields cannot be
 * rewritten, and that consent provenance comes from the database and not the
 * caller.
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

const kidPayload = (over: Record<string, unknown> = {}) => ({
  first_name: 'Mina',
  last_name: 'Hanna',
  dob: '2014-03-05',
  gender: 'male',
  email: null,
  phone: null,
  allergies: 'peanuts',
  home_address: '1 Main St, Hayward CA',
  emergency_contact_name: 'Sara Hanna',
  emergency_contact_phone: '555-0100',
  guardian_name: 'Sara Hanna',
  guardian_phone: '555-0101',
  guardian_email: 'sara@test.local',
  ...over,
});

const regPayload = (over: Record<string, unknown> = {}) => ({
  grade: 5,
  division: 'juniors',
  tshirt_size: 'YM',
  top_sports: ['soccer'],
  ...over,
});

async function makeParent(client: PoolClient, email: string): Promise<string> {
  const id = await createProfile(client, { email });
  await grantRole(client, id, 'parent');
  return id;
}

async function currentSeasonId(client: PoolClient): Promise<string> {
  const r = await client.query<{ id: string }>('select id from seasons where is_current limit 1');
  return r.rows[0].id;
}

/** A photo the browser has uploaded, as the Storage API leaves it. Call as the superuser. */
async function uploadPhoto(client: PoolClient, ownerId: string): Promise<string> {
  const name = `${randomUUID()}.webp`;
  await client.query(
    `insert into storage.objects (bucket_id, name, owner_id) values ('kid-photos', $1, $2)`,
    [name, ownerId]
  );
  return name;
}

/**
 * Calls register_kid as `userId`. By default it uploads a fresh photo first and
 * sends it, because a kid needs one; pass `photo: null` to send none, or a path
 * to send that one.
 */
async function registerAs(
  client: PoolClient,
  userId: string,
  opts: {
    kidId?: string | null;
    kid?: Record<string, unknown>;
    reg?: Record<string, unknown>;
    consent?: boolean;
    photo?: string | null;
  } = {}
): Promise<{ kid_id: string; registration_id: string; old_photo_path: string | null }> {
  const photo = opts.photo === undefined ? await uploadPhoto(client, userId) : opts.photo;
  return asUser(client, userId, async () => {
    const r = await client.query(
      'select * from register_kid($1::uuid, $2::jsonb, $3::jsonb, $4, $5)',
      [
        opts.kidId ?? null,
        JSON.stringify(opts.kid ?? kidPayload()),
        JSON.stringify(opts.reg ?? regPayload()),
        opts.consent ?? true,
        photo,
      ]
    );
    return r.rows[0];
  });
}

/** A kid as an Admin's CSV import would leave it: no parent, no consent. */
async function importedKid(
  client: PoolClient,
  opts: { guardianEmail?: string; parentUserId?: string | null; lastName?: string } = {}
): Promise<string> {
  const k = await client.query<{ id: string }>(
    `insert into kids (
       first_name, last_name, dob, gender, home_address,
       emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email, parent_user_id
     ) values ('Marina',$1,'2013-06-01','female','9 Old Rd','EC','555-0102',
               'Guardian','555-0103',$2,$3)
     returning id`,
    [opts.lastName ?? 'Imported', opts.guardianEmail ?? 'imp@test.local', opts.parentUserId ?? null]
  );
  return k.rows[0].id;
}

async function importedRegistration(client: PoolClient, kidId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into registrations (kid_id, season_id, grade, division, tshirt_size, source)
     values ($1,$2,6,'juniors','YL','import') returning id`,
    [kidId, await currentSeasonId(client)]
  );
  return r.rows[0].id;
}

describe('register_kid -- authorisation', () => {
  it('lets a parent register a new kid, linked to them', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-parent1@test.local');

      const { kid_id, registration_id } = await registerAs(client, parentId);

      const kid = await client.query('select * from kids where id = $1', [kid_id]);
      expect(kid.rows[0].parent_user_id).toBe(parentId);
      expect(kid.rows[0].first_name).toBe('Mina');

      const reg = await client.query('select * from registrations where id = $1', [registration_id]);
      expect(reg.rows[0].source).toBe('parent');
      expect(reg.rows[0].created_by).toBe(parentId);
      expect(reg.rows[0].season_id).toBe(await currentSeasonId(client));
      expect(reg.rows[0].top_sports).toEqual(['soccer']);
    });
  });

  // SECURITY DEFINER writes regardless of the caller's RLS, so the has_role
  // check inside the function is the only thing keeping these out.
  it.each(['coach', 'prayer', 'program', 'kid', 'admin'])(
    'refuses a user whose only role is %s',
    async (role) => {
      await withTx(pool, async (client) => {
        const id = await createProfile(client, { email: `rk-${role}@test.local` });
        await grantRole(client, id, role);

        await expect(registerAs(client, id)).rejects.toThrow(/Parent/i);
        expect((await client.query('select 1 from kids')).rowCount).toBe(0);
      });
    }
  );

  it('refuses a user holding no role at all', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'rk-nobody@test.local' });
      await expect(registerAs(client, id)).rejects.toThrow(/Parent/i);
    });
  });

  it('refuses an unauthenticated caller', async () => {
    await withTx(pool, async (client) => {
      await client.query('SAVEPOINT anon');
      await client.query('SET LOCAL ROLE anon');
      await expect(
        client.query('select * from register_kid(null, $1::jsonb, $2::jsonb, true)', [
          JSON.stringify(kidPayload()),
          JSON.stringify(regPayload()),
        ])
      ).rejects.toThrow(/permission denied/i);
      await client.query('ROLLBACK TO SAVEPOINT anon');
    });
  });

  it('refuses when the waiver is not agreed, and writes nothing', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-nowaiver@test.local');

      await expect(registerAs(client, parentId, { consent: false })).rejects.toThrow(/waiver/i);
      expect((await client.query('select 1 from kids')).rowCount).toBe(0);
    });
  });
});

describe('register_kid -- consent provenance', () => {
  it('stamps the caller and a database time, never supplied values', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-prov@test.local');

      const { registration_id } = await registerAs(client, parentId);

      const r = await client.query(
        'select consent_given_at, consent_by_user_id from registrations where id = $1',
        [registration_id]
      );
      expect(r.rows[0].consent_by_user_id).toBe(parentId);
      expect(Math.abs(Date.now() - r.rows[0].consent_given_at.getTime())).toBeLessThan(60_000);
    });
  });
});

describe('register_kid -- returning kids', () => {
  it("refuses another parent's kid, and leaves it untouched", async () => {
    await withTx(pool, async (client) => {
      const owner = await makeParent(client, 'rk-owner@test.local');
      const intruder = await makeParent(client, 'rk-intruder@test.local');
      const { kid_id } = await registerAs(client, owner);

      await expect(
        registerAs(client, intruder, {
          kidId: kid_id,
          kid: kidPayload({ home_address: 'hijacked' }),
        })
      ).rejects.toThrow(/not found/i);

      const k = await client.query('select home_address, parent_user_id from kids where id = $1', [
        kid_id,
      ]);
      expect(k.rows[0].home_address).toBe('1 Main St, Hayward CA');
      expect(k.rows[0].parent_user_id).toBe(owner);
    });
  });

  // Same error as a kid that belongs to someone else, so ids cannot be probed.
  it('refuses an unlinked kid and an unknown id identically', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-unlinked@test.local');
      const unlinked = await importedKid(client);

      await expect(registerAs(client, parentId, { kidId: unlinked })).rejects.toThrow(/not found/i);
      await expect(
        registerAs(client, parentId, { kidId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow(/not found/i);
    });
  });

  it('updates the editable fields', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-edit@test.local');
      const { kid_id } = await registerAs(client, parentId);

      await registerAs(client, parentId, {
        kidId: kid_id,
        kid: kidPayload({
          home_address: '2 Oak Ave',
          allergies: null,
          phone: '555-0199',
          guardian_phone: '555-0177',
        }),
      });

      const k = await client.query('select * from kids where id = $1', [kid_id]);
      expect(k.rows[0].home_address).toBe('2 Oak Ave');
      expect(k.rows[0].allergies).toBeNull();
      expect(k.rows[0].phone).toBe('555-0199');
      expect(k.rows[0].guardian_phone).toBe('555-0177');
    });
  });

  it('ignores attempts to change the locked fields, skill_tags and the owner', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-locked@test.local');
      const other = await makeParent(client, 'rk-locked-other@test.local');
      const { kid_id } = await registerAs(client, parentId);

      await registerAs(client, parentId, {
        kidId: kid_id,
        kid: kidPayload({
          first_name: 'Someone',
          last_name: 'Else',
          dob: '2010-01-01',
          gender: 'female',
          skill_tags: ['goalie'],
          parent_user_id: other,
        }),
      });

      const k = await client.query('select * from kids where id = $1', [kid_id]);
      expect(k.rows[0].first_name).toBe('Mina');
      expect(k.rows[0].last_name).toBe('Hanna');
      expect(k.rows[0].dob.toISOString().slice(0, 10)).toBe('2014-03-05');
      expect(k.rows[0].gender).toBe('male');
      expect(k.rows[0].skill_tags).toEqual([]);
      expect(k.rows[0].parent_user_id).toBe(parentId);
    });
  });

  it('does not blank required data when a key is absent', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-partial@test.local');
      const { kid_id } = await registerAs(client, parentId);

      await registerAs(client, parentId, { kidId: kid_id, kid: { guardian_phone: '555-0166' } });

      const k = await client.query('select * from kids where id = $1', [kid_id]);
      expect(k.rows[0].guardian_phone).toBe('555-0166');
      expect(k.rows[0].home_address).toBe('1 Main St, Hayward CA');
      expect(k.rows[0].allergies).toBe('peanuts');
    });
  });
});

describe('register_kid -- the season registration', () => {
  it('edits the same registration when submitted again, and re-stamps consent', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-resubmit@test.local');
      const first = await registerAs(client, parentId);
      await client.query(
        `update registrations set consent_given_at = now() - interval '2 days' where id = $1`,
        [first.registration_id]
      );

      const second = await registerAs(client, parentId, {
        kidId: first.kid_id,
        reg: regPayload({ tshirt_size: 'YL' }),
      });

      expect(second.registration_id).toBe(first.registration_id);
      const rows = await client.query(
        'select tshirt_size, consent_given_at from registrations where kid_id = $1',
        [first.kid_id]
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].tshirt_size).toBe('YL');
      expect(Date.now() - rows.rows[0].consent_given_at.getTime()).toBeLessThan(60_000);
    });
  });

  it('is blocked once an Admin has placed the kid on a team', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-team@test.local');
      const { kid_id, registration_id } = await registerAs(client, parentId);
      const team = await client.query<{ id: string }>(
        `insert into ministry_teams (name, division) values ('Team A','juniors') returning id`
      );
      await client.query('update registrations set team_id = $2 where id = $1', [
        registration_id,
        team.rows[0].id,
      ]);

      await expect(
        registerAs(client, parentId, { kidId: kid_id, reg: regPayload({ tshirt_size: 'YL' }) })
      ).rejects.toThrow(/already on a team/i);

      const r = await client.query('select tshirt_size from registrations where id = $1', [
        registration_id,
      ]);
      expect(r.rows[0].tshirt_size).toBe('YM');
    });
  });

  it('records consent on a CSV-imported registration, keeping its source', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-imported@test.local');
      const kidId = await importedKid(client, { parentUserId: parentId });
      const regId = await importedRegistration(client, kidId);

      await registerAs(client, parentId, {
        kidId,
        kid: { guardian_phone: '555-0155' },
        reg: regPayload({ grade: 6, tshirt_size: 'YL' }),
      });

      const r = await client.query('select * from registrations where id = $1', [regId]);
      expect(r.rows[0].source).toBe('import');
      expect(r.rows[0].consent_by_user_id).toBe(parentId);
      expect(r.rows[0].consent_given_at).not.toBeNull();
    });
  });

  it('rejects a duplicate name and date of birth for the same parent', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-dupe@test.local');
      await registerAs(client, parentId);

      await expect(registerAs(client, parentId)).rejects.toThrow(/already added/i);
      expect((await client.query('select 1 from kids')).rowCount).toBe(1);
    });
  });

  it('allows twins, who differ by first name', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-twins@test.local');
      await registerAs(client, parentId);
      await registerAs(client, parentId, { kid: kidPayload({ first_name: 'Mark' }) });

      expect((await client.query('select 1 from kids')).rowCount).toBe(2);
    });
  });

  // The Google Form backup: the CSV import leaves kids with no parent. A parent
  // who later registers the same child gets sent to an Admin, not a second row
  // and not the existing one (ENG-29).
  describe('a kid already on file with no parent', () => {
    it('is refused, ignoring case and spaces, and nothing is written', async () => {
      await withTx(pool, async (client) => {
        const parentId = await makeParent(client, 'rk-onfile@test.local');
        const imported = await importedKid(client, { lastName: 'Imported' });
        const before = (await client.query('select 1 from kids')).rowCount;

        const err = await asUserError(client, () =>
          registerAs(client, parentId, {
            kid: kidPayload({ first_name: ' MARINA ', last_name: 'imported', dob: '2013-06-01' }),
          })
        );

        expect(err.code).toBe('55007');
        expect((await client.query('select 1 from kids')).rowCount).toBe(before);
        const owner = await client.query('select parent_user_id from kids where id = $1', [imported]);
        expect(owner.rows[0].parent_user_id).toBeNull();
      });
    });

    it('does not stop a twin, who differs by first name', async () => {
      await withTx(pool, async (client) => {
        const parentId = await makeParent(client, 'rk-onfile-twin@test.local');
        await importedKid(client, { lastName: 'Imported' });

        const { kid_id } = await registerAs(client, parentId, {
          kid: kidPayload({ first_name: 'Mark', last_name: 'Imported', dob: '2013-06-01' }),
        });

        const r = await client.query('select parent_user_id from kids where id = $1', [kid_id]);
        expect(r.rows[0].parent_user_id).toBe(parentId);
      });
    });

    it('does not stop a different child with the same name and another birthday', async () => {
      await withTx(pool, async (client) => {
        const parentId = await makeParent(client, 'rk-onfile-dob@test.local');
        await importedKid(client, { lastName: 'Imported' });

        await expect(
          registerAs(client, parentId, {
            kid: kidPayload({ first_name: 'Marina', last_name: 'Imported', dob: '2012-01-01' }),
          })
        ).resolves.toBeDefined();
      });
    });
  });

  it('lets one parent register several kids', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-many@test.local');
      await registerAs(client, parentId);
      await registerAs(client, parentId, {
        kid: kidPayload({ first_name: 'Mariam', dob: '2011-09-09', gender: 'female' }),
        reg: regPayload({ grade: 8, division: 'ambassadors' }),
      });

      const r = await client.query('select 1 from kids where parent_user_id = $1', [parentId]);
      expect(r.rowCount).toBe(2);
    });
  });

  it('fails when there is no active season', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-noseason@test.local');
      await client.query('update seasons set is_current = false');

      await expect(registerAs(client, parentId)).rejects.toThrow(/no active season/i);
    });
  });

  it('still enforces the database CHECK constraints', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-checks@test.local');

      await expect(
        registerAs(client, parentId, { reg: regPayload({ grade: 3 }) })
      ).rejects.toThrow(/registrations_grade_range/);
      await expect(
        registerAs(client, parentId, { reg: regPayload({ grade: 8, division: 'juniors' }) })
      ).rejects.toThrow(/registrations_division_matches_grade/);
      await expect(
        registerAs(client, parentId, { reg: regPayload({ tshirt_size: 'XXXL' }) })
      ).rejects.toThrow(/registrations_tshirt_size_values/);
      // Each failed call rolled back as a whole: no orphaned kid rows.
      expect((await client.query('select 1 from kids')).rowCount).toBe(0);
    });
  });
});

// link_my_kids() attached imported kids by matching the guardian email. Parents
// now join through one shared link, so that would hand a family's kids to anyone
// who signed in with the right address (ENG-27, ENG-29). A parent sees only the
// kids they registered themselves or an Admin attached.
describe('a parent only sees their own kids', () => {
  async function kidsSeenBy(client: PoolClient, userId: string): Promise<string[]> {
    return asUser(client, userId, async () =>
      (await client.query('select id from kids order by id')).rows.map((r) => r.id)
    );
  }

  it('no longer has a link_my_kids function', async () => {
    await withTx(pool, async (client) => {
      const r = await client.query(`select to_regprocedure('public.link_my_kids()') as fn`);
      expect(r.rows[0].fn).toBeNull();
    });
  });

  it('does not see an imported kid whose guardian email is theirs, even confirmed', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'own1@test.local');
      await client.query('update auth.users set email_confirmed_at = now() where id = $1', [parentId]);
      const imported = await importedKid(client, { guardianEmail: 'own1@test.local' });

      expect(await kidsSeenBy(client, parentId)).toEqual([]);
      await expect(registerAs(client, parentId, { kidId: imported })).rejects.toThrow(/not found/i);
      const owner = await client.query('select parent_user_id from kids where id = $1', [imported]);
      expect(owner.rows[0].parent_user_id).toBeNull();
    });
  });

  it('sees the kids they registered and an Admin attached, and no one else\'s', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'own2@test.local');
      const otherId = await makeParent(client, 'own2-other@test.local');
      const { kid_id: mine } = await registerAs(client, parentId);
      const attached = await importedKid(client, { guardianEmail: 'own2@test.local', lastName: 'A', parentUserId: parentId });
      const theirs = await importedKid(client, { guardianEmail: 'own2-other@test.local', lastName: 'B', parentUserId: otherId });
      await importedKid(client, { guardianEmail: 'own2@test.local', lastName: 'C' }); // unlinked, same email

      expect(await kidsSeenBy(client, parentId)).toEqual([mine, attached].sort());
      expect(await kidsSeenBy(client, otherId)).toEqual([theirs]);
    });
  });
});

// ENG-30: an Admin gives a CSV-imported kid to the parent who has since joined.
// The Server Action writes `kids.parent_user_id` under the Admin's own session, so
// the boundary is the `"admin manage kids"` policy. What matters here is that no
// one else can do it, and that once attached, the parent sees that kid and no one
// else does.
describe('attaching an imported kid to a parent (Admin only)', () => {
  const attach = (client: PoolClient, userId: string, kidId: string, parentId: string) =>
    asUser(client, userId, async () => {
      const r = await client.query(
        'update kids set parent_user_id = $1 where id = $2 and parent_user_id is null returning id',
        [parentId, kidId]
      );
      return r.rowCount ?? 0;
    });

  const ownerOf = async (client: PoolClient, kidId: string) =>
    (await client.query('select parent_user_id from kids where id = $1', [kidId])).rows[0].parent_user_id;

  async function makeAdmin(client: PoolClient, email: string) {
    const id = await createProfile(client, { email });
    await grantRole(client, id, 'admin');
    return id;
  }

  it('lets an Admin attach a kid who has no parent', async () => {
    await withTx(pool, async (client) => {
      const admin = await makeAdmin(client, 'att-admin@test.local');
      const parentId = await makeParent(client, 'att-parent@test.local');
      const kid = await importedKid(client, { lastName: 'Attach' });

      expect(await attach(client, admin, kid, parentId)).toBe(1);
      expect(await ownerOf(client, kid)).toBe(parentId);
    });
  });

  it.each(['parent', 'coach', 'program', 'prayer', 'kid'])('does not let a %s attach a kid', async (role) => {
    await withTx(pool, async (client) => {
      const actor = await createProfile(client, { email: `att-${role}@test.local` });
      await grantRole(client, actor, role);
      const parentId = await makeParent(client, `att-target-${role}@test.local`);
      const kid = await importedKid(client, { lastName: 'Guarded' });

      // RLS filters the row out (0 rows) or the write is refused outright; either way nothing changes.
      await attach(client, actor, kid, parentId).catch(() => 0);

      expect(await ownerOf(client, kid)).toBeNull();
    });
  });

  it('does not let a parent hand their own kid to someone else', async () => {
    await withTx(pool, async (client) => {
      const owner = await makeParent(client, 'att-owner@test.local');
      const other = await makeParent(client, 'att-other@test.local');
      const kid = await importedKid(client, { lastName: 'Mine', parentUserId: owner });

      const changed = await asUser(client, owner, async () => {
        try {
          const r = await client.query('update kids set parent_user_id = $1 where id = $2', [other, kid]);
          return r.rowCount ?? 0;
        } catch {
          return 0;
        }
      });

      expect(changed).toBe(0);
      expect(await ownerOf(client, kid)).toBe(owner);
    });
  });

  it('never moves a kid who already has a parent', async () => {
    await withTx(pool, async (client) => {
      const admin = await makeAdmin(client, 'att-admin2@test.local');
      const owner = await makeParent(client, 'att-owner2@test.local');
      const other = await makeParent(client, 'att-other2@test.local');
      const kid = await importedKid(client, { lastName: 'Taken', parentUserId: owner });

      expect(await attach(client, admin, kid, other)).toBe(0);
      expect(await ownerOf(client, kid)).toBe(owner);
    });
  });

  it('lets the attached parent read and re-register the kid, and no one else', async () => {
    await withTx(pool, async (client) => {
      const admin = await makeAdmin(client, 'att-admin3@test.local');
      const parentId = await makeParent(client, 'att-parent3@test.local');
      const stranger = await makeParent(client, 'att-stranger3@test.local');
      const kid = await importedKid(client, { guardianEmail: 'att-parent3@test.local', lastName: 'Visible' });
      await importedRegistration(client, kid);

      const seenBefore = await asUser(client, parentId, async () => (await client.query('select id from kids')).rowCount);
      expect(seenBefore).toBe(0);

      await attach(client, admin, kid, parentId);

      const seen = await asUser(client, parentId, async () =>
        (await client.query('select id from kids')).rows.map((r) => r.id)
      );
      expect(seen).toEqual([kid]);
      const strangerSees = await asUser(client, stranger, async () => (await client.query('select id from kids')).rowCount);
      expect(strangerSees).toBe(0);

      const { kid_id } = await registerAs(client, parentId, { kidId: kid, reg: regPayload() });
      expect(kid_id).toBe(kid);
    });
  });

  // The Server Action finds the parent by email under the Admin's own session.
  it('lets an Admin, and no one else, look an account up by email', async () => {
    await withTx(pool, async (client) => {
      const admin = await makeAdmin(client, 'att-admin4@test.local');
      const target = await makeParent(client, 'att-target4@test.local');
      const snoop = await makeParent(client, 'att-snoop4@test.local');

      const find = (userId: string) =>
        asUser(client, userId, async () => ({
          profile: (await client.query('select id from profiles where email = $1', ['att-target4@test.local'])).rowCount,
          role: (await client.query('select 1 from user_roles where user_id = $1', [target])).rowCount,
        }));

      expect(await find(admin)).toEqual({ profile: 1, role: 1 });
      expect(await find(snoop)).toEqual({ profile: 0, role: 0 });
    });
  });
});

describe('seasons -- signed-in users read the current season only', () => {
  it('shows a parent the current season and not past ones', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'season-parent@test.local');
      await client.query(
        `insert into seasons (name, is_current, starts_on) values ('Old Season', false, '2020-01-01')`
      );

      const names = await asUser(client, parentId, async () =>
        (await client.query('select name from seasons')).rows.map((r) => r.name)
      );
      expect(names).toEqual([(await client.query('select name from seasons where is_current')).rows[0].name]);
    });
  });

  // Replaced the Parent-only policy (ENG-18): a roleless servant needs the
  // season name for their form. Past seasons stay hidden from them.
  it('shows a user with no role the current season and not past ones', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'season-nobody@test.local' });
      await client.query(
        `insert into seasons (name, is_current, starts_on) values ('Old Season', false, '2020-01-01')`
      );

      const names = await asUser(client, id, async () =>
        (await client.query('select name from seasons')).rows.map((r) => r.name)
      );
      expect(names).toEqual([(await client.query('select name from seasons where is_current')).rows[0].name]);
    });
  });
});

describe('register_kid -- the photo', () => {
  const kidRows = (client: PoolClient, parentId: string) =>
    client.query('select photo_path, photo_updated_at from kids where parent_user_id = $1', [parentId]);

  it('attaches the photo to a new kid, in the same call', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-new@test.local');
      const photo = await uploadPhoto(client, parentId);

      const { kid_id, old_photo_path } = await registerAs(client, parentId, { photo });

      expect(old_photo_path).toBeNull();
      const r = await client.query('select photo_path, photo_updated_at from kids where id = $1', [kid_id]);
      expect(r.rows[0].photo_path).toBe(photo);
      expect(r.rows[0].photo_updated_at).not.toBeNull();
    });
  });

  it('refuses a new kid with no photo, and writes nothing', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-none@test.local');

      const err = await asUserError(client, () => registerAs(client, parentId, { photo: null }));

      expect(err.code).toBe('22004');
      expect((await kidRows(client, parentId)).rowCount).toBe(0);
    });
  });

  it('refuses a call with the old four arguments for a new kid, so the photo cannot be skipped', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-four@test.local');

      const err = await asUserError(client, () =>
        asUser(client, parentId, () =>
          client.query('select * from register_kid(null::uuid, $1::jsonb, $2::jsonb, true)', [
            JSON.stringify(kidPayload()),
            JSON.stringify(regPayload()),
          ])
        )
      );

      expect(err.code).toBe('22004');
    });
  });

  it('refuses a returning kid who has no photo on file and sends none', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-imp@test.local');
      const kid = await importedKid(client, { parentUserId: parentId });
      await importedRegistration(client, kid);

      const err = await asUserError(client, () =>
        registerAs(client, parentId, { kidId: kid, reg: regPayload({ grade: 6 }), photo: null })
      );

      expect(err.code).toBe('22004');
    });
  });

  it('adds the photo for a returning kid who had none', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-add@test.local');
      const kid = await importedKid(client, { parentUserId: parentId });
      await importedRegistration(client, kid);
      const photo = await uploadPhoto(client, parentId);

      const r = await registerAs(client, parentId, { kidId: kid, reg: regPayload({ grade: 6 }), photo });

      expect(r.old_photo_path).toBeNull();
      expect((await kidRows(client, parentId)).rows[0].photo_path).toBe(photo);
    });
  });

  it('lets a returning kid who already has a photo send none, and keeps it', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-keep@test.local');
      const first = await registerAs(client, parentId);
      const before = (await kidRows(client, parentId)).rows[0];

      const again = await registerAs(client, parentId, { kidId: first.kid_id, photo: null });

      expect(again.old_photo_path).toBeNull();
      expect((await kidRows(client, parentId)).rows[0].photo_path).toBe(before.photo_path);
    });
  });

  it('replaces the photo and returns the old one so it can be deleted', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-swap@test.local');
      const first = await registerAs(client, parentId);
      const original = (await kidRows(client, parentId)).rows[0].photo_path;
      const next = await uploadPhoto(client, parentId);

      const again = await registerAs(client, parentId, { kidId: first.kid_id, photo: next });

      expect(again.old_photo_path).toBe(original);
      expect((await kidRows(client, parentId)).rows[0].photo_path).toBe(next);
    });
  });

  it('refuses an upload that does not exist, with the same error as someone else’s', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-miss@test.local');
      const otherId = await makeParent(client, 'rk-photo-other@test.local');
      const theirs = await uploadPhoto(client, otherId);

      const missing = await asUserError(client, () =>
        registerAs(client, parentId, { photo: `${randomUUID()}.webp` })
      );
      const stolen = await asUserError(client, () => registerAs(client, parentId, { photo: theirs }));

      expect(missing.code).toBe('02000');
      expect(stolen.code).toBe('02000');
      expect(stolen.message).toBe(missing.message);
      expect((await kidRows(client, parentId)).rowCount).toBe(0);
    });
  });

  it('refuses a photo that is already another kid’s, and says it is the photo', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-dup@test.local');
      const photo = await uploadPhoto(client, parentId);
      await registerAs(client, parentId, { photo });

      const err = await asUserError(client, () =>
        registerAs(client, parentId, { kid: kidPayload({ first_name: 'Mark' }), photo })
      );

      expect(err.code).toBe('23505');
      expect(err.message).toMatch(/photo/i);
    });
  });

  it('does not tell a duplicate kid from a reused photo by anything but the message', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-twin@test.local');
      await registerAs(client, parentId);

      const err = await asUserError(client, () => registerAs(client, parentId));

      expect(err.code).toBe('23505');
      expect(err.message).not.toMatch(/photo/i);
    });
  });

  it('rolls the photo back when the registration is refused', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'rk-photo-team@test.local');
      const first = await registerAs(client, parentId);
      const before = (await kidRows(client, parentId)).rows[0].photo_path;
      const team = await client.query<{ id: string }>(
        `insert into ministry_teams (name, division) values ('Photo Team','juniors') returning id`
      );
      await client.query('update registrations set team_id = $2 where id = $1', [
        first.registration_id,
        team.rows[0].id,
      ]);
      const next = await uploadPhoto(client, parentId);

      await expect(
        registerAs(client, parentId, { kidId: first.kid_id, photo: next })
      ).rejects.toThrow(/already on a team/i);

      expect((await kidRows(client, parentId)).rows[0].photo_path).toBe(before);
    });
  });
});

/** Runs `fn` expecting a Postgres error, and returns it. */
async function asUserError(
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
  throw new Error('expected the call to be rejected, but it succeeded');
}
