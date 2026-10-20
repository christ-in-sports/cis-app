/**
 * @jest-environment node
 */
import { POST } from './route';

const createUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser } } }),
}));

const ENV = {
  SERVANT_SIGNUP_CODE: 'servant-code',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
};

function signup(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

const valid = {
  email: ' New.Servant@Example.com ',
  password: 'a-long-enough-password',
  displayName: ' New Servant ',
  signupCode: 'servant-code',
};

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, ...ENV };
  createUser.mockReset().mockResolvedValue({ error: null });
});

afterAll(() => {
  process.env = originalEnv;
});

describe('POST /api/auth/signup', () => {
  it('creates an account with no role when the servant code matches', async () => {
    const res = await signup(valid);

    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledTimes(1);
    const args = createUser.mock.calls[0][0];
    expect(args.email).toBe('new.servant@example.com');
    expect(args.user_metadata).toEqual({ display_name: 'New Servant' });
    // The code never decides what someone can do: no role travels with the account.
    expect(JSON.stringify(args)).not.toMatch(/signup_role/);
  });

  it('rejects a wrong code with 403 and creates nothing', async () => {
    const res = await signup({ ...valid, signupCode: 'nope' });

    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects the old staff and coach codes', async () => {
    process.env.STAFF_SIGNUP_CODE = 'old-staff-code';
    process.env.COACH_SIGNUP_CODE = 'old-coach-code';

    expect((await signup({ ...valid, signupCode: 'old-staff-code' })).status).toBe(403);
    expect((await signup({ ...valid, signupCode: 'old-coach-code' })).status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a missing code', async () => {
    const { signupCode: _omitted, ...withoutCode } = valid;
    const res = await signup(withoutCode);

    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('returns 500 when SERVANT_SIGNUP_CODE is not configured', async () => {
    delete process.env.SERVANT_SIGNUP_CODE;
    const res = await signup(valid);

    expect(res.status).toBe(500);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a short password even with the right code', async () => {
    const res = await signup({ ...valid, password: 'short' });

    expect(res.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('tells the caller when the email is already registered', async () => {
    createUser.mockResolvedValue({ error: { message: 'User already registered' } });
    const res = await signup(valid);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already exists/i);
  });
});
