/**
 * @jest-environment node
 */
import { joinAsSignedInUser, sendJoinCode, verifyJoinCode } from './actions';

const signInWithOtp = jest.fn();
const verifyOtp = jest.fn();
const getUser = jest.fn();
const insert = jest.fn();
const from = jest.fn(() => ({ insert }));

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { signInWithOtp, verifyOtp, getUser } }),
}));

let serviceConfigured = true;
jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => (serviceConfigured ? { from } : null),
}));

const originalEnv = process.env;
const CODE = 'parent-code-123';
const send = { code: CODE, name: ' Mariam Guirguis ', email: ' Mariam@Example.com ' };
const verify = { code: CODE, email: 'mariam@example.com', token: '123456' };

beforeEach(() => {
  process.env = { ...originalEnv, PARENT_JOIN_CODE: CODE };
  serviceConfigured = true;
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  verifyOtp.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
  insert.mockReset().mockResolvedValue({ error: null });
  from.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});

afterEach(() => {
  process.env = originalEnv;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Runs an action that may wait out the wrong-code delay. */
async function run<T>(call: () => Promise<T>): Promise<T> {
  const pending = call();
  await jest.advanceTimersByTimeAsync(1000);
  return pending;
}

describe('sendJoinCode', () => {
  it('emails a code, creating the account, with the name kept for the profile', async () => {
    const result = await run(() => sendJoinCode(send));

    expect(result).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'mariam@example.com',
      options: { shouldCreateUser: true, data: { display_name: 'Mariam Guirguis' } },
    });
  });

  it('sends nothing for a wrong join code', async () => {
    const result = await run(() => sendJoinCode({ ...send, code: 'old-code' }));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/link has changed/i);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends nothing, and says so, when the join code is not configured', async () => {
    delete process.env.PARENT_JOIN_CODE;
    const result = await run(() => sendJoinCode(send));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available/i);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('refuses a missing name or a bad email before asking Supabase', async () => {
    expect((await run(() => sendJoinCode({ ...send, name: '  ' }))).error).toMatch(/name/i);
    expect((await run(() => sendJoinCode({ ...send, email: 'nope' }))).error).toMatch(/email/i);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('explains a rate limit, and hides any other failure', async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 429, code: 'over_email_send_rate_limit' } });
    expect((await run(() => sendJoinCode(send))).error).toMatch(/too many requests/i);

    signInWithOtp.mockResolvedValue({ error: { status: 500, code: 'unexpected_failure' } });
    expect((await run(() => sendJoinCode(send))).error).toMatch(/could not send a code/i);
  });
});

describe('verifyJoinCode', () => {
  it('grants Parent only after the emailed code checks out', async () => {
    const result = await run(() => verifyJoinCode(verify));

    expect(result).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'mariam@example.com', token: '123456', type: 'email' });
    expect(from).toHaveBeenCalledWith('user_roles');
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', role: 'parent' });
  });

  it('grants nothing when the code is wrong or expired', async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { status: 403, code: 'otp_expired' } });
    const result = await run(() => verifyJoinCode(verify));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/did not work/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it('grants nothing, and does not even check the code, when the join code is wrong', async () => {
    const result = await run(() => verifyJoinCode({ ...verify, code: 'old-code' }));

    expect(result.ok).toBe(false);
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('grants only the parent role, never another', async () => {
    await run(() => verifyJoinCode(verify));

    const roles = insert.mock.calls.map(([row]) => row.role);
    expect(roles).toEqual(['parent']);
  });

  it('treats a parent who already has the role as joined', async () => {
    insert.mockResolvedValue({ error: { code: '23505' } });
    expect(await run(() => verifyJoinCode(verify))).toEqual({ ok: true });
  });

  it('reports a failed grant without leaking the database error', async () => {
    insert.mockResolvedValue({ error: { code: 'XX000', message: 'secret detail' } });
    const result = await run(() => verifyJoinCode(verify));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/try the link again/i);
    expect(JSON.stringify(result)).not.toMatch(/secret detail/);
  });

  it('refuses when the service role is not configured', async () => {
    serviceConfigured = false;
    const result = await run(() => verifyJoinCode(verify));

    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a token that is not six digits without calling Supabase', async () => {
    const result = await run(() => verifyJoinCode({ ...verify, token: '12' }));

    expect(result.ok).toBe(false);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe('joinAsSignedInUser', () => {
  it('adds Parent to the signed-in account', async () => {
    expect(await run(() => joinAsSignedInUser({ code: CODE }))).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', role: 'parent' });
  });

  it('grants nothing for a wrong join code', async () => {
    const result = await run(() => joinAsSignedInUser({ code: 'old-code' }));

    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('grants nothing when nobody is signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await run(() => joinAsSignedInUser({ code: CODE }));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/signed out/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a request with no code at all', async () => {
    expect((await run(() => joinAsSignedInUser({}))).ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
