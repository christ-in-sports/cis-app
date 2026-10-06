/**
 * RLS + behaviour tests for registration payments
 * (supabase/migrations/*_payments.sql): the `payments` table,
 * `record_payments()` and `delete_payment()`.
 *
 * Role-based access is on AGENTS.md §7's must-test list, and both functions are
 * SECURITY DEFINER -- their own has_role('admin') check is the only thing
 * between a coach and a payment record. Like consent, when a payment was
 * recorded and by whom must come from the database, never the caller; that is
 * why the table has no write policy at all.
 *
 * Also guards the two paths that write registrations for other reasons -- the
 * CSV import and the parent form -- against ever dropping a recorded payment.
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
  const r = await client.query<{ id: string }>('select id from seasons where is_current limit 1');
  return r.rows[0].id;
}

/** A kid registered for the active season, optionally linked to a parent. */
async function createRegistration(
  client: PoolClient,
  opts: { first?: string; parentUserId?: string | null } = {}
): Promise<{ kidId: string; registrationId: string }> {
  const k = await client.query<{ id: string }>(
    `insert into kids (
       first_name, last_name, dob, gender, home_address,
       emergency_contact_name, emergency_contact_phone,
       guardian_name, guardian_phone, guardian_email, parent_user_id
     ) values ($1,'Guirguis','2014-03-02','male','1 Church Way','EC','555-0100',
               'Guardian','555-0101','g@test.local',$2)
     returning id`,
    [opts.first ?? 'Mina', opts.parentUserId ?? null]
  );
  const r = await client.query<{ id: string }>(
    `insert into registrations (kid_id, season_id, grade, division, tshirt_size, source)
     values ($1,$2,6,'juniors','YM','import') returning id`,
    [k.rows[0].id, await currentSeasonId(client)]
  );
  return { kidId: k.rows[0].id, registrationId: r.rows[0].id };
}

async function makeUser(client: PoolClient, email: string, role?: string): Promise<string> {
  const id = await createProfile(client, { email });
  if (role) await grantRole(client, id, role);
  return id;
}

async function recordAs(
  client: PoolClient,
  userId: string,
  registrationIds: string | string[],
  amountCents = 8500,
  method = 'cash'
) {
  const ids = Array.isArray(registrationIds) ? registrationIds : [registrationIds];
  return asUser(client, userId, async () => {
    const r = await client.query(
      'select * from record_payments($1::uuid[], $2, $3)',
      [ids, amountCents, method]
    );
    return r.rows as Array<{
      payment_id: string;
      registration_id: string;
      amount_cents: number;
      method: string;
      received_at: Date;
    }>;
  });
}

async function deleteAs(client: PoolClient, userId: string, paymentId: string) {
  return asUser(client, userId, async () => {
    const r = await client.query('select delete_payment($1) as registration_id', [paymentId]);
    return r.rows[0].registration_id as string;
  });
}

async function paymentsFor(client: PoolClient, registrationId: string) {
  const r = await client.query(
    'select * from payments where registration_id = $1 order by created_at',
    [registrationId]
  );
  return r.rows;
}

const UNKNOWN = '00000000-0000-0000-0000-000000000000';

describe('record_payments -- authorisation', () => {
  it('lets an admin record a payment', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-admin@test.local', 'admin');
      const { registrationId } = await createRegistration(client);

      const rows = await recordAs(client, adminId, registrationId, 4250, 'venmo');

      expect(rows).toHaveLength(1);
      const [p] = await paymentsFor(client, registrationId);
      expect(p.amount_cents).toBe(4250);
      expect(p.method).toBe('venmo');
    });
  });

  // SECURITY DEFINER writes regardless of the caller's RLS. A parent is in the
  // list on purpose: they may *read* their kid's payments, never record one.
  it.each(['coach', 'program', 'prayer', 'parent', 'kid'])(
    'refuses a user whose only role is %s',
    async (role) => {
      await withTx(pool, async (client) => {
        const id = await makeUser(client, `pay-${role}@test.local`, role);
        const { registrationId } = await createRegistration(client, {
          parentUserId: role === 'parent' ? id : null,
        });

        await expect(recordAs(client, id, registrationId)).rejects.toThrow(/Admin/i);
        expect(await paymentsFor(client, registrationId)).toHaveLength(0);
      });
    }
  );

  it('refuses a user holding no role at all', async () => {
    await withTx(pool, async (client) => {
      const id = await makeUser(client, 'pay-nobody@test.local');
      const { registrationId } = await createRegistration(client);

      await expect(recordAs(client, id, registrationId)).rejects.toThrow(/Admin/i);
    });
  });

  it('is not callable by an anonymous request at all', async () => {
    await withTx(pool, async (client) => {
      const { registrationId } = await createRegistration(client);

      await client.query('SAVEPOINT anon_call');
      await client.query('SET LOCAL ROLE anon');
      await expect(
        client.query('select * from record_payments($1::uuid[], 8500, $2)', [[registrationId], 'cash'])
      ).rejects.toThrow(/permission denied/i);
      await client.query('ROLLBACK TO SAVEPOINT anon_call');

      expect(await paymentsFor(client, registrationId)).toHaveLength(0);
    });
  });
});

describe('record_payments -- provenance', () => {
  it('attributes the payment to the calling admin and stamps the database time', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-prov@test.local', 'admin');
      const { registrationId } = await createRegistration(client);

      await recordAs(client, adminId, registrationId);

      const [p] = await paymentsFor(client, registrationId);
      expect(p.recorded_by).toBe(adminId);
      expect(Math.abs(Date.now() - (p.received_at as Date).getTime())).toBeLessThan(60_000);
    });
  });
});

describe('record_payments -- what it accepts', () => {
  it('allows partial payments: a second payment is added, not merged', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-partial@test.local', 'admin');
      const { registrationId } = await createRegistration(client);

      await recordAs(client, adminId, registrationId, 4000, 'cash');
      await recordAs(client, adminId, registrationId, 4500, 'paypal');

      const rows = await paymentsFor(client, registrationId);
      expect(rows.map((r) => r.amount_cents)).toEqual([4000, 4500]);
    });
  });

  it.each([
    ['a zero amount', 0, 'cash'],
    ['a negative amount', -500, 'cash'],
    ['more than $1,000', 100_001, 'cash'],
    ['an unknown method', 8500, 'zelle'],
  ])('rejects %s', async (_label, amount, method) => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-bad@test.local', 'admin');
      const { registrationId } = await createRegistration(client);

      await expect(recordAs(client, adminId, registrationId, amount, method)).rejects.toThrow(
        /payments_(amount_range|method_values)/
      );
      expect(await paymentsFor(client, registrationId)).toHaveLength(0);
    });
  });

  it('accepts the $1,000 ceiling exactly', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-max@test.local', 'admin');
      const { registrationId } = await createRegistration(client);

      await recordAs(client, adminId, registrationId, 100_000);
      expect(await paymentsFor(client, registrationId)).toHaveLength(1);
    });
  });
});

describe('record_payments -- recording a batch', () => {
  it('records the same payment for every registration in one call', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-bulk1@test.local', 'admin');
      const a = await createRegistration(client, { first: 'Mina' });
      const b = await createRegistration(client, { first: 'Marina' });

      const rows = await recordAs(client, adminId, [a.registrationId, b.registrationId], 8500, 'cash');

      expect(rows).toHaveLength(2);
      for (const id of [a.registrationId, b.registrationId]) {
        const [p] = await paymentsFor(client, id);
        expect(p.amount_cents).toBe(8500);
        expect(p.recorded_by).toBe(adminId);
      }
    });
  });

  // A double tick must not charge a family twice.
  it('collapses a registration listed twice into one payment', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-bulk2@test.local', 'admin');
      const { registrationId } = await createRegistration(client);

      await recordAs(client, adminId, [registrationId, registrationId]);

      expect(await paymentsFor(client, registrationId)).toHaveLength(1);
    });
  });

  it('applies nothing at all when one id in the batch is unknown', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-bulk3@test.local', 'admin');
      const { registrationId } = await createRegistration(client);

      await expect(recordAs(client, adminId, [registrationId, UNKNOWN])).rejects.toThrow(
        /no longer exist/i
      );
      expect(await paymentsFor(client, registrationId)).toHaveLength(0);
    });
  });

  it('refuses an empty batch rather than silently doing nothing', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-bulk4@test.local', 'admin');

      await expect(recordAs(client, adminId, [])).rejects.toThrow(/No registrations given/i);
    });
  });
});

describe('delete_payment', () => {
  it('lets an admin remove a payment, leaving the others', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-del1@test.local', 'admin');
      const { registrationId } = await createRegistration(client);
      const [first] = await recordAs(client, adminId, registrationId, 4000);
      await recordAs(client, adminId, registrationId, 4500);

      const returned = await deleteAs(client, adminId, first.payment_id);

      expect(returned).toBe(registrationId);
      const rows = await paymentsFor(client, registrationId);
      expect(rows.map((r) => r.amount_cents)).toEqual([4500]);
    });
  });

  it.each(['coach', 'program', 'parent'])('refuses a %s', async (role) => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, `pay-del-a-${role}@test.local`, 'admin');
      const otherId = await makeUser(client, `pay-del-${role}@test.local`, role);
      const { registrationId } = await createRegistration(client, {
        parentUserId: role === 'parent' ? otherId : null,
      });
      const [p] = await recordAs(client, adminId, registrationId);

      await expect(deleteAs(client, otherId, p.payment_id)).rejects.toThrow(/Admin/i);
      expect(await paymentsFor(client, registrationId)).toHaveLength(1);
    });
  });

  it('raises on a payment that does not exist', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-del2@test.local', 'admin');

      await expect(deleteAs(client, adminId, UNKNOWN)).rejects.toThrow(/no longer exists/i);
    });
  });
});

describe('payments -- RLS', () => {
  async function visibleTo(client: PoolClient, userId: string) {
    return asUser(client, userId, async () => {
      const r = await client.query<{ registration_id: string }>('select registration_id from payments');
      return r.rows.map((row) => row.registration_id);
    });
  }

  it("lets a parent read their own kid's payments and no one else's", async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-rls-admin@test.local', 'admin');
      const parentId = await makeUser(client, 'pay-rls-parent@test.local', 'parent');
      const mine = await createRegistration(client, { first: 'Mine', parentUserId: parentId });
      const theirs = await createRegistration(client, { first: 'Theirs' });
      await recordAs(client, adminId, [mine.registrationId, theirs.registrationId]);

      expect(await visibleTo(client, parentId)).toEqual([mine.registrationId]);
    });
  });

  it('lets an admin read every payment', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-rls-admin2@test.local', 'admin');
      const a = await createRegistration(client, { first: 'A' });
      const b = await createRegistration(client, { first: 'B' });
      await recordAs(client, adminId, [a.registrationId, b.registrationId]);

      expect((await visibleTo(client, adminId)).sort()).toEqual(
        [a.registrationId, b.registrationId].sort()
      );
    });
  });

  // Unlike the rest of the kid's record, payments are not roster data: the
  // permission matrix gives them to Admin and Parents only.
  it.each(['coach', 'program', 'prayer'])('hides every payment from a %s', async (role) => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, `pay-rls-a-${role}@test.local`, 'admin');
      const otherId = await makeUser(client, `pay-rls-${role}@test.local`, role);
      const { registrationId } = await createRegistration(client);
      await recordAs(client, adminId, registrationId);

      expect(await visibleTo(client, otherId)).toEqual([]);
    });
  });

  // No write policy exists, so even an Admin cannot hand-craft a row with
  // someone else's name or a back-dated time through PostgREST.
  it.each([
    ['INSERT', (regId: string) => [
      `insert into payments (registration_id, amount_cents, method, recorded_by, received_at)
       values ($1, 8500, 'cash', null, '2020-01-01')`, [regId]] as const],
    ['UPDATE', (regId: string) => [
      `update payments set amount_cents = 1 where registration_id = $1 returning id`, [regId]] as const],
    ['DELETE', (regId: string) => [
      `delete from payments where registration_id = $1 returning id`, [regId]] as const],
  ])('refuses a direct %s even from an admin', async (_verb, statement) => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-rls-write@test.local', 'admin');
      const { registrationId } = await createRegistration(client);
      await recordAs(client, adminId, registrationId);
      const [sql, params] = statement(registrationId);

      // INSERT is rejected outright; UPDATE and DELETE match no rows, because
      // without a policy no row is visible to them.
      const outcome = await asUser(client, adminId, async () => {
        const r = await client.query(sql, [...params]);
        return r.rowCount;
      }).catch((err: Error) => err);

      if (outcome instanceof Error) {
        expect(outcome.message).toMatch(/row-level security/i);
      } else {
        expect(outcome).toBe(0);
      }
      const [p] = await paymentsFor(client, registrationId);
      expect(p.amount_cents).toBe(8500);
      expect(await paymentsFor(client, registrationId)).toHaveLength(1);
    });
  });
});

describe('payments survive the other registration writes', () => {
  it('a re-import of the same kid keeps their payments', async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-reimport@test.local', 'admin');
      const { registrationId } = await createRegistration(client);
      await recordAs(client, adminId, registrationId);

      const b = await client.query<{ id: string }>(
        `insert into import_batches (file_name, season_id, uploaded_by, status, total_rows, valid_rows, error_rows)
         values ('roster.csv', $1, $2, 'ready', 1, 1, 0) returning id`,
        [await currentSeasonId(client), adminId]
      );
      await client.query(
        `insert into import_rows (batch_id, row_number, raw, parsed, errors, action)
         values ($1, 2, '[]'::jsonb, $2::jsonb, '[]'::jsonb, 'update')`,
        [
          b.rows[0].id,
          JSON.stringify({
            kid: {
              first_name: 'Mina', last_name: 'Guirguis', dob: '2014-03-02', gender: 'male',
              email: null, phone: null, allergies: null, home_address: '1 Church Way',
              emergency_contact_name: 'EC', emergency_contact_phone: '555-0100',
              guardian_name: 'Guardian', guardian_phone: '555-0101',
              guardian_email: 'g@test.local', skill_tags: [],
            },
            registration: { grade: 7, division: 'ambassadors', tshirt_size: 'YL', top_sports: null },
          }),
        ]
      );

      await asUser(client, adminId, () => client.query('select import_commit($1)', [b.rows[0].id]));

      const reg = await client.query('select grade from registrations where id = $1', [registrationId]);
      expect(reg.rows[0].grade).toBe(7);
      expect(await paymentsFor(client, registrationId)).toHaveLength(1);
    });
  });

  it("a parent re-saving the form keeps their kid's payments", async () => {
    await withTx(pool, async (client) => {
      const adminId = await makeUser(client, 'pay-resave-admin@test.local', 'admin');
      const parentId = await makeUser(client, 'pay-resave-parent@test.local', 'parent');
      const { kidId, registrationId } = await createRegistration(client, { parentUserId: parentId });
      await recordAs(client, adminId, registrationId);

      await asUser(client, parentId, () =>
        client.query('select * from register_kid($1::uuid, $2::jsonb, $3::jsonb, true)', [
          kidId,
          JSON.stringify({
            email: null, phone: null, allergies: 'peanuts', home_address: '2 New St',
            emergency_contact_name: 'EC', emergency_contact_phone: '555-0100',
            guardian_name: 'Guardian', guardian_phone: '555-0101', guardian_email: 'g@test.local',
          }),
          JSON.stringify({ grade: 6, division: 'juniors', tshirt_size: 'YL', top_sports: null }),
        ])
      );

      expect(await paymentsFor(client, registrationId)).toHaveLength(1);
    });
  });
});
