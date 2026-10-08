/**
 * RLS + behaviour tests for the parent registration functions
 * (supabase/migrations/*_parent_registration.sql): `register_kid()`,
 * `link_my_kids()` and the "parents read current season" policy.
 *
 * Both functions are SECURITY DEFINER and write records about minors, so what
 * is worth protecting is: who may call them (AGENTS.md §7), that a parent can
 * only touch their own kids, that the locked identity fields cannot be
 * rewritten, and that consent provenance comes from the database and not the
 * caller.
 *
 * Run with `npm run test:db` (requires `npx supabase start`).
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

/** Calls register_kid as `userId`. */
async function registerAs(
  client: PoolClient,
  userId: string,
  opts: {
    kidId?: string | null;
    kid?: Record<string, unknown>;
    reg?: Record<string, unknown>;
    consent?: boolean;
  } = {}
): Promise<{ kid_id: string; registration_id: string }> {
  return asUser(client, userId, async () => {
    const r = await client.query(
      'select * from register_kid($1::uuid, $2::jsonb, $3::jsonb, $4)',
      [
        opts.kidId ?? null,
        JSON.stringify(opts.kid ?? kidPayload()),
        JSON.stringify(opts.reg ?? regPayload()),
        opts.consent ?? true,
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

describe('link_my_kids', () => {
  async function linkAs(client: PoolClient, userId: string): Promise<number> {
    return asUser(client, userId, async () => {
      const r = await client.query<{ n: number }>('select link_my_kids() as n');
      return r.rows[0].n;
    });
  }

  async function confirmEmail(client: PoolClient, userId: string) {
    await client.query('update auth.users set email_confirmed_at = now() where id = $1', [userId]);
  }

  async function ownerOf(client: PoolClient, kidId: string) {
    const r = await client.query('select parent_user_id from kids where id = $1', [kidId]);
    return r.rows[0].parent_user_id;
  }

  it('links kids whose guardian email matches, ignoring case and whitespace', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'link1@test.local');
      await confirmEmail(client, parentId);
      const a = await importedKid(client, { guardianEmail: 'link1@test.local', lastName: 'A' });
      const b = await importedKid(client, { guardianEmail: '  LINK1@Test.Local ', lastName: 'B' });
      const other = await importedKid(client, { guardianEmail: 'someone@test.local', lastName: 'C' });

      expect(await linkAs(client, parentId)).toBe(2);
      expect(await ownerOf(client, a)).toBe(parentId);
      expect(await ownerOf(client, b)).toBe(parentId);
      expect(await ownerOf(client, other)).toBeNull();
    });
  });

  // Otherwise anyone could sign up with someone else's address and be handed
  // that family's children.
  it('does nothing while the email is unconfirmed', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'link2@test.local');
      const kid = await importedKid(client, { guardianEmail: 'link2@test.local' });

      expect(await linkAs(client, parentId)).toBe(0);
      expect(await ownerOf(client, kid)).toBeNull();
    });
  });

  it('never takes a kid from the parent who already has it', async () => {
    await withTx(pool, async (client) => {
      const owner = await makeParent(client, 'link-owner@test.local');
      const parentId = await makeParent(client, 'link3@test.local');
      await confirmEmail(client, parentId);
      const kid = await importedKid(client, { guardianEmail: 'link3@test.local', parentUserId: owner });

      expect(await linkAs(client, parentId)).toBe(0);
      expect(await ownerOf(client, kid)).toBe(owner);
    });
  });

  it('is idempotent', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'link4@test.local');
      await confirmEmail(client, parentId);
      await importedKid(client, { guardianEmail: 'link4@test.local' });

      expect(await linkAs(client, parentId)).toBe(1);
      expect(await linkAs(client, parentId)).toBe(0);
    });
  });

  it('lets a linked parent then read the kid and re-register it', async () => {
    await withTx(pool, async (client) => {
      const parentId = await makeParent(client, 'link5@test.local');
      await confirmEmail(client, parentId);
      const kid = await importedKid(client, { guardianEmail: 'link5@test.local' });
      await linkAs(client, parentId);

      const seen = await asUser(client, parentId, async () =>
        (await client.query('select id from kids')).rows.map((r) => r.id)
      );
      expect(seen).toEqual([kid]);

      const { kid_id } = await registerAs(client, parentId, { kidId: kid, reg: regPayload() });
      expect(kid_id).toBe(kid);
    });
  });

  it.each(['coach', 'prayer', 'program', 'admin'])('refuses a %s', async (role) => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: `link-${role}@test.local` });
      await grantRole(client, id, role);

      await expect(linkAs(client, id)).rejects.toThrow(/Parent/i);
    });
  });
});

describe('seasons -- parents read the current season only', () => {
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

  it('shows a user with no role nothing', async () => {
    await withTx(pool, async (client) => {
      const id = await createProfile(client, { email: 'season-nobody@test.local' });

      const rows = await asUser(client, id, async () => (await client.query('select 1 from seasons')).rows);
      expect(rows).toHaveLength(0);
    });
  });
});
