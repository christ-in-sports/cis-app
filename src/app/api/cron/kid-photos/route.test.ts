/**
 * @jest-environment node
 */
import { GET } from './route';

const rpc = jest.fn();
const remove = jest.fn();
const from = jest.fn(() => ({ remove }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc, storage: { from } }),
}));

const ENV = {
  CRON_SECRET: 'cron-secret',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
};

const call = (token?: string) =>
  GET(
    new Request('http://localhost/api/cron/kid-photos', {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    })
  );

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `photo-${i}.webp` }));

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, ...ENV };
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValue({ data: [], error: null });
  remove.mockImplementation(async (batch: string[]) => ({ data: batch.map((name) => ({ name })), error: null }));
});

afterAll(() => {
  process.env = originalEnv;
});

describe('GET /api/cron/kid-photos -- who may run it', () => {
  it.each([undefined, '', 'wrong', 'cron-secre', 'cron-secret-and-more'])(
    'refuses the token %p and deletes nothing',
    async (token) => {
      const res = await call(token);

      expect(res.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    }
  );

  it('refuses a request with no authorization header at all', async () => {
    const res = await GET(new Request('http://localhost/api/cron/kid-photos'));

    expect(res.status).toBe(401);
  });

  it.each(['CRON_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL'])(
    'reports a misconfiguration, never runs open, when %s is missing',
    async (key) => {
      delete process.env[key];

      const res = await call('cron-secret');

      expect(res.status).toBe(500);
      expect(rpc).not.toHaveBeenCalled();
    }
  );
});

describe('GET /api/cron/kid-photos -- cleaning up', () => {
  it('lists the orphans from the database and deletes exactly those from the kid-photos bucket', async () => {
    rpc.mockResolvedValue({ data: names(3), error: null });

    const res = await call('cron-secret');

    expect(rpc).toHaveBeenCalledWith('kid_photo_orphans');
    expect(from).toHaveBeenCalledWith('kid-photos');
    expect(remove).toHaveBeenCalledWith(['photo-0.webp', 'photo-1.webp', 'photo-2.webp']);
    expect(await res.json()).toEqual({ removed: 3 });
  });

  it('does nothing when there is nothing to clean', async () => {
    const res = await call('cron-secret');

    expect(remove).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ removed: 0 });
  });

  it('deletes in batches of 100', async () => {
    rpc.mockResolvedValue({ data: names(250), error: null });

    const res = await call('cron-secret');

    expect(remove.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 50]);
    expect(await res.json()).toEqual({ removed: 250 });
  });

  it('counts what Storage actually deleted, not what it was asked to', async () => {
    rpc.mockResolvedValue({ data: names(3), error: null });
    remove.mockResolvedValue({ data: [{ name: 'photo-0.webp' }], error: null });

    expect(await (await call('cron-secret')).json()).toEqual({ removed: 1 });
  });

  it('reports a failure to list, and deletes nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });

    const res = await call('cron-secret');

    expect(res.status).toBe(500);
    expect(remove).not.toHaveBeenCalled();
  });

  it('stops at the first failed delete and says how far it got', async () => {
    rpc.mockResolvedValue({ data: names(250), error: null });
    remove
      .mockResolvedValueOnce({ data: names(100), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'down' } });

    const res = await call('cron-secret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Cleanup failed.', removed: 100 });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
