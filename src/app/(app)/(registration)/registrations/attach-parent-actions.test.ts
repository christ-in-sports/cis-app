/**
 * @jest-environment node
 *
 * The two Server Actions behind "Attach to parent": that only a signed-in Admin
 * gets anywhere, that the parent is found by email among accounts holding Parent
 * (and only those), and that the kid is only ever given to a parent while they
 * have none. The database side (who may write `kids.parent_user_id`) is
 * `supabase/tests/parent-registration.test.ts`.
 */
import { revalidatePath } from 'next/cache';

import { checkAdmin } from '@/lib/auth/admin';

import { attachKidToParent, findParentByEmail } from './actions';

jest.mock('@/lib/auth/admin', () => ({ checkAdmin: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const KID = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';
const PARENT_ID = '11111111-2222-4333-8444-555555555555';

/** A tiny stand-in for the query builder: every method returns it, and awaiting or `maybeSingle()` resolves. */
function builder(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'update']) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return b;
    };
  }
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (resolve: (r: unknown) => unknown) => resolve(result);
  return { b, calls };
}

interface Fixture {
  profile?: { id: string; display_name: string | null; email: string } | null;
  role?: { role: string } | null;
  updated?: Array<{ id: string }>;
  updateError?: { code: string } | null;
}

function signInAs(user: { userId: string | null; isAdmin: boolean }, fx: Fixture = {}) {
  const profiles = builder({ data: fx.profile ?? null, error: null });
  const roles = builder({ data: fx.role ?? null, error: null });
  const kids = builder({ data: fx.updated ?? [], error: fx.updateError ?? null });
  const from = jest.fn((table: string) => ({ profiles: profiles.b, user_roles: roles.b, kids: kids.b })[table]);
  jest.mocked(checkAdmin).mockResolvedValue({ ...user, supabase: { from } } as unknown as Awaited<
    ReturnType<typeof checkAdmin>
  >);
  return { from, profiles, roles, kids };
}

const parentProfile = { id: PARENT_ID, display_name: 'Mariam Guirguis', email: 'mariam@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe.each([
  ['findParentByEmail', () => findParentByEmail('mariam@example.com')],
  ['attachKidToParent', () => attachKidToParent({ kidId: KID, email: 'mariam@example.com' })],
])('%s -- who may call it', (_name, call) => {
  it('refuses someone who is signed out, without touching the database', async () => {
    const { from } = signInAs({ userId: null, isAdmin: false });

    const result = await call();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/signed in/i);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['coach', 'program', 'parent', 'prayer'])('refuses a signed-in %s, without touching the database', async () => {
    const { from } = signInAs({ userId: 'someone', isAdmin: false });

    const result = await call();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Admins only/i);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('findParentByEmail', () => {
  it('finds a Parent by email, ignoring case and spaces', async () => {
    const { profiles } = signInAs({ userId: 'admin', isAdmin: true }, { profile: parentProfile, role: { role: 'parent' } });

    const result = await findParentByEmail('  Mariam@Example.COM ');

    expect(result).toEqual({ ok: true, parent: { name: 'Mariam Guirguis', email: 'mariam@example.com' } });
    expect(profiles.calls).toContainEqual(['eq', ['email', 'mariam@example.com']]);
  });

  it('falls back to the email when the account has no name', async () => {
    signInAs({ userId: 'admin', isAdmin: true }, { profile: { ...parentProfile, display_name: null }, role: { role: 'parent' } });

    const result = await findParentByEmail('mariam@example.com');

    expect(result.parent?.name).toBe('mariam@example.com');
  });

  it('says so when no account has that email', async () => {
    signInAs({ userId: 'admin', isAdmin: true }, { profile: null });

    const result = await findParentByEmail('nobody@example.com');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No account has that email/);
  });

  it('refuses an account that does not hold Parent, so a servant is never matched', async () => {
    const { roles } = signInAs({ userId: 'admin', isAdmin: true }, { profile: parentProfile, role: null });

    const result = await findParentByEmail('mariam@example.com');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not a Parent/);
    expect(roles.calls).toContainEqual(['eq', ['role', 'parent']]);
  });

  it('refuses something that is not an email, without a lookup', async () => {
    const { from } = signInAs({ userId: 'admin', isAdmin: true });

    const result = await findParentByEmail('mariam');

    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('attachKidToParent', () => {
  it('gives the kid to the parent, only while the kid has none', async () => {
    const { kids } = signInAs(
      { userId: 'admin', isAdmin: true },
      { profile: parentProfile, role: { role: 'parent' }, updated: [{ id: KID }] },
    );

    const result = await attachKidToParent({ kidId: KID, email: 'Mariam@Example.com' });

    expect(result).toEqual({ ok: true, parent: { name: 'Mariam Guirguis', email: 'mariam@example.com' } });
    expect(kids.calls).toContainEqual(['update', [{ parent_user_id: PARENT_ID }]]);
    expect(kids.calls).toContainEqual(['eq', ['id', KID]]);
    expect(kids.calls).toContainEqual(['is', ['parent_user_id', null]]);
    expect(revalidatePath).toHaveBeenCalledWith('/registrations');
  });

  it('does not move a kid who already has a parent', async () => {
    signInAs({ userId: 'admin', isAdmin: true }, { profile: parentProfile, role: { role: 'parent' }, updated: [] });

    const result = await attachKidToParent({ kidId: KID, email: 'mariam@example.com' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already has a parent/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('writes nothing when the email is not a Parent', async () => {
    const { kids } = signInAs({ userId: 'admin', isAdmin: true }, { profile: parentProfile, role: null });

    const result = await attachKidToParent({ kidId: KID, email: 'mariam@example.com' });

    expect(result.ok).toBe(false);
    expect(kids.calls).toEqual([]);
  });

  it('refuses a kid id that is not an id, without a lookup', async () => {
    const { from } = signInAs({ userId: 'admin', isAdmin: true });

    const result = await attachKidToParent({ kidId: 'nope', email: 'mariam@example.com' });

    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('logs only the error code, because a message can name a kid', async () => {
    signInAs(
      { userId: 'admin', isAdmin: true },
      { profile: parentProfile, role: { role: 'parent' }, updateError: { code: 'XX000' } },
    );

    const result = await attachKidToParent({ kidId: KID, email: 'mariam@example.com' });

    expect(result).toEqual({ ok: false, error: 'Could not attach the kid.' });
    expect(console.error).toHaveBeenCalledWith('attachKidToParent failed:', 'XX000');
  });
});
