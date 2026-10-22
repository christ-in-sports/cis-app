/**
 * @jest-environment node
 */
import { revalidatePath } from 'next/cache';

import { checkAnyRole } from '@/lib/auth/roles';

import { replaceKidPhoto } from './kid-photo-actions';

jest.mock('@/lib/auth/roles', () => ({ checkAnyRole: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const KID = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';
const NEW_PATH = '4f3c1d52-9c7e-4d52-8a35-0b1f2f6c7a11.webp';
const OLD_PATH = '0a1b2c3d-1111-4222-8333-444455556666.webp';
const input = { kid_id: KID, photo_path: NEW_PATH };

const rpc = jest.fn();
const remove = jest.fn();
const storage = { from: jest.fn(() => ({ remove })) };

function signedInAs(roles: { userId: string | null; hasRole: boolean }) {
  jest.mocked(checkAnyRole).mockResolvedValue({
    ...roles,
    supabase: { rpc, storage },
  } as unknown as Awaited<ReturnType<typeof checkAnyRole>>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  signedInAs({ userId: 'user-id', hasRole: true });
  rpc.mockResolvedValue({ data: null, error: null });
  remove.mockResolvedValue({ data: [], error: null });
});

describe('replaceKidPhoto -- who may call it', () => {
  it('asks for an Admin or a Parent, and nobody else', async () => {
    await replaceKidPhoto(input);

    expect(checkAnyRole).toHaveBeenCalledWith(['admin', 'parent']);
  });

  it('tells a signed-out caller, and does nothing', async () => {
    signedInAs({ userId: null, hasRole: false });

    expect(await replaceKidPhoto(input)).toEqual({ ok: false, error: 'You are no longer signed in.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['coach', 'program', 'prayer', 'none'])('refuses someone without the Admin or Parent role (%s)', async () => {
    signedInAs({ userId: 'user-id', hasRole: false });

    const result = await replaceKidPhoto(input);

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('replaceKidPhoto -- input', () => {
  it.each([
    {},
    { kid_id: KID },
    { kid_id: 'not-a-uuid', photo_path: NEW_PATH },
    { kid_id: KID, photo_path: 'folder/x.webp' },
    { kid_id: KID, photo_path: 'x.heic' },
    null,
    'x',
  ])('rejects %o before touching the database', async (bad) => {
    const result = await replaceKidPhoto(bad);

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('replaceKidPhoto -- replacing', () => {
  it('attaches the upload through set_kid_photo', async () => {
    expect(await replaceKidPhoto(input)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('set_kid_photo', { p_kid: KID, p_path: NEW_PATH });
  });

  it('deletes the replaced file, and only after the new one is saved', async () => {
    const order: string[] = [];
    rpc.mockImplementation(async () => {
      order.push('save');
      return { data: OLD_PATH, error: null };
    });
    remove.mockImplementation(async () => {
      order.push('remove');
      return { data: [{ name: OLD_PATH }], error: null };
    });

    await replaceKidPhoto(input);

    expect(storage.from).toHaveBeenCalledWith('kid-photos');
    expect(remove).toHaveBeenCalledWith([OLD_PATH]);
    expect(order).toEqual(['save', 'remove']);
  });

  it('deletes nothing when the kid had no photo, or it was already this one', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await replaceKidPhoto(input);

    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the old file when saving the new one fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });

    const result = await replaceKidPhoto(input);

    expect(result).toEqual({ ok: false, error: 'Could not save the photo.' });
    expect(remove).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('still succeeds when the old file cannot be deleted, leaving it for the daily cleanup', async () => {
    rpc.mockResolvedValue({ data: OLD_PATH, error: null });
    remove.mockResolvedValue({ data: null, error: { message: 'denied' } });

    expect(await replaceKidPhoto(input)).toEqual({ ok: true });
  });

  it('refreshes the screens that show photos', async () => {
    await replaceKidPhoto(input);

    expect(revalidatePath).toHaveBeenCalledWith('/register');
    expect(revalidatePath).toHaveBeenCalledWith('/registrations');
    expect(revalidatePath).toHaveBeenCalledWith('/attendance', 'layout');
  });
});

describe('replaceKidPhoto -- database errors', () => {
  it.each([
    ['42501', /own kids/],
    ['02000', /not found/],
    ['23505', /already used/],
  ])('maps %s to a message a person can act on', async (code, message) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'raw database text' } });

    const result = await replaceKidPhoto(input);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(message);
    expect(result.error).not.toMatch(/raw database text/);
  });

  it('logs only the error code, because the message can name a kid', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: `kid ${KID} photo ${NEW_PATH}` } });

    await replaceKidPhoto(input);

    const logged = jest.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).toContain('XX000');
    expect(logged).not.toContain(KID);
    expect(logged).not.toContain(NEW_PATH);
  });
});
