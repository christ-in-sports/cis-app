/**
 * RLS + behaviour tests for `set_registrations_consent()`
 * (supabase/migrations/*_record_consent.sql).
 *
 * This records a consent decision about a minor, so two things are worth
 * protecting. Access, per AGENTS.md §7: the function is SECURITY DEFINER, so
 * its own has_role('admin') check is the only thing standing between a coach
 * and the consent record.
 *
 * And provenance: the timestamp and the attributed user must be derived inside
 * the database, never supplied by the caller. That is the whole reason this is
 * a function rather than a plain UPDATE -- the `admin manage registrations`
 * policy would otherwise let an Admin PATCH any value straight to PostgREST.
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

async function currentSeasonId(client: PoolClient): Promise<string> {
  const r = await client.query<{ id: string }>(
    'select id from seasons where is_current limit 1'
  );
  return r.rows[0].id;
}

/** A kid registered for the active season, with no consent recorded. */
async function createRegistration(client: PoolClient, name = 'Mina'): Promise<string> {
  const k = await client.query<{ id: string }>(
    `insert into kids (
       first_name, last_name, dob, gender, home_address,
       emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email
     ) values ($1,'Guirguis','2014-03-02','male','1 Church Way','EC','555-0100',
               'Guardian','555-0101','g@test.local')
     returning id`,
    [name]
  );

  const r = await client.query<{ id: string }>(
    `insert into registrations (kid_id, season_id, grade, division, tshirt_size, source)
     values ($1,$2,6,'juniors','YM','import') returning id`,
    [k.rows[0].id, await currentSeasonId(client)]
  );
  return r.rows[0].id;
}

async function setConsentAs(
  client: PoolClient,
  userId: string,
  registrationIds: string | string[],
  received: boolean
) {
  const ids = Array.isArray(registrationIds) ? registrationIds : [registrationIds];
  return asUser(client, userId, async () => {
    const r = await client.query(
      'select * from set_registrations_consent($1::uuid[], $2)',
      [ids, received]
    );
    return r.rows;
  });
}

async function makeAdmin(client: PoolClient, email: string): Promise<string> {
  const id = await createProfile(client, { email });
  await grantRole(client, id, 'admin');
  return id;
}

async function readConsent(client: PoolClient, registrationId: string) {
  const r = await client.query<{ consent_given_at: Date | null; consent_by_user_id: string | null }>(
    'select consent_given_at, consent_by_user_id from registrations where id = $1',
    [registrationId]
  );
  return r.rows[0];
}

describe('set_registrations_consent -- authorisation', () => {
  it('lets an admin record consent', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'consent-admin@test.local');
      const regId = await createRegistration(client);

      await setConsentAs(client, adminId, regId, true);

      const row = await readConsent(client, regId);
      expect(row.consent_given_at).not.toBeNull();
      expect(row.consent_by_user_id).toBe(adminId);
    });
  });

  // SECURITY DEFINER writes regardless of the caller's RLS, so this check is
  // the only thing protecting the record.
  it('refuses a coach even though the function is SECURITY DEFINER', async () => {
    await withTx(pool, async (client) => {
      const coachId = await createProfile(client, { email: 'consent-coach@test.local' });
      await grantRole(client, coachId, 'coach');
      const regId = await createRegistration(client);

      await expect(setConsentAs(client, coachId, regId, true)).rejects.toThrow(/Admin/i);
      expect((await readConsent(client, regId)).consent_given_at).toBeNull();
    });
  });

  it('refuses program team', async () => {
    await withTx(pool, async (client) => {
      const programId = await createProfile(client, { email: 'consent-program@test.local' });
      await grantRole(client, programId, 'program');
      const regId = await createRegistration(client);

      await expect(setConsentAs(client, programId, regId, true)).rejects.toThrow(/Admin/i);
      expect((await readConsent(client, regId)).consent_given_at).toBeNull();
    });
  });

  it('refuses a user holding no role at all', async () => {
    await withTx(pool, async (client) => {
      const nobodyId = await createProfile(client, { email: 'consent-nobody@test.local' });
      const regId = await createRegistration(client);

      await expect(setConsentAs(client, nobodyId, regId, true)).rejects.toThrow(/Admin/i);
    });
  });
});

describe('set_registrations_consent -- provenance', () => {
  // The point of the function: neither value can be supplied by the caller.
  it('attributes consent to the admin who recorded it, not to anyone passed in', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'consent-admin2@test.local');
      const otherId = await createProfile(client, { email: 'consent-other@test.local' });
      const regId = await createRegistration(client);

      await setConsentAs(client, adminId, regId, true);

      const row = await readConsent(client, regId);
      expect(row.consent_by_user_id).toBe(adminId);
      expect(row.consent_by_user_id).not.toBe(otherId);
    });
  });

  it('stamps the time from the database, close to now', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'consent-admin3@test.local');
      const regId = await createRegistration(client);

      await setConsentAs(client, adminId, regId, true);

      const { consent_given_at: at } = await readConsent(client, regId);
      expect(at).not.toBeNull();
      expect(Math.abs(Date.now() - (at as Date).getTime())).toBeLessThan(60_000);
    });
  });
});

describe('set_registrations_consent -- correcting a mistake', () => {
  it('clears both fields when consent is withdrawn', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'consent-admin4@test.local');
      const regId = await createRegistration(client);

      await setConsentAs(client, adminId, regId, true);
      await setConsentAs(client, adminId, regId, false);

      const row = await readConsent(client, regId);
      expect(row.consent_given_at).toBeNull();
      expect(row.consent_by_user_id).toBeNull();
    });
  });

  it('touches only the registration named', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'consent-admin5@test.local');
      const regA = await createRegistration(client, 'Mina');
      const regB = await createRegistration(client, 'Marina');

      await setConsentAs(client, adminId, regA, true);

      expect((await readConsent(client, regA)).consent_given_at).not.toBeNull();
      expect((await readConsent(client, regB)).consent_given_at).toBeNull();
    });
  });

  it('raises on a registration that does not exist, rather than silently doing nothing', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'consent-admin6@test.local');

      await expect(
        setConsentAs(client, adminId, '00000000-0000-0000-0000-000000000000', true)
      ).rejects.toThrow(/no longer exist/i);
    });
  });
});

describe('set_registrations_consent -- marking a batch', () => {
  // The reason this takes an array: an Admin with a stack of paper forms marks
  // several at once, and N round trips would be both slow and non-atomic.
  it('records consent for every registration in one call', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'bulk-admin1@test.local');
      const ids = [
        await createRegistration(client, 'Mina'),
        await createRegistration(client, 'Marina'),
        await createRegistration(client, 'Peter'),
      ];

      const rows = await setConsentAs(client, adminId, ids, true);
      expect(rows).toHaveLength(3);

      for (const id of ids) {
        const row = await readConsent(client, id);
        expect(row.consent_given_at).not.toBeNull();
        expect(row.consent_by_user_id).toBe(adminId);
      }
    });
  });

  it('leaves registrations outside the batch alone', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'bulk-admin2@test.local');
      const inBatch = await createRegistration(client, 'Mina');
      const outside = await createRegistration(client, 'Marina');

      await setConsentAs(client, adminId, [inBatch], true);

      expect((await readConsent(client, inBatch)).consent_given_at).not.toBeNull();
      expect((await readConsent(client, outside)).consent_given_at).toBeNull();
    });
  });

  // A stale screen is the realistic way to hit this. Applying the rest would
  // leave the Admin believing every form they ticked had been recorded.
  it('applies nothing at all when one id in the batch is unknown', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'bulk-admin3@test.local');
      const real = await createRegistration(client, 'Mina');

      await expect(
        setConsentAs(client, adminId, [real, '00000000-0000-0000-0000-000000000000'], true)
      ).rejects.toThrow(/no longer exist/i);

      expect((await readConsent(client, real)).consent_given_at).toBeNull();
    });
  });

  it('refuses an empty batch rather than silently doing nothing', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeAdmin(client, 'bulk-admin4@test.local');

      await expect(setConsentAs(client, adminId, [], true)).rejects.toThrow(
        /No registrations given/i
      );
    });
  });

  it('still refuses a non-admin for a batch', async () => {
    await withTx(pool, async (client) => {
      const coachId = await createProfile(client, { email: 'bulk-coach@test.local' });
      await grantRole(client, coachId, 'coach');
      const ids = [
        await createRegistration(client, 'Mina'),
        await createRegistration(client, 'Marina'),
      ];

      await expect(setConsentAs(client, coachId, ids, true)).rejects.toThrow(/Admin/i);
      for (const id of ids) {
        expect((await readConsent(client, id)).consent_given_at).toBeNull();
      }
    });
  });
});
