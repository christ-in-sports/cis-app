/**
 * @jest-environment node
 */
import { revalidatePath } from 'next/cache';

import { checkRole } from '@/lib/auth/roles';

import { registerKid } from './actions';

jest.mock('@/lib/auth/roles', () => ({ checkRole: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const PHOTO = '4f3c1d52-9c7e-4d52-8a35-0b1f2f6c7a11.webp';
const OLD_PHOTO = '0a1b2c3d-1111-4222-8333-444455556666.webp';
const KID = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';

const kidFields = {
  email: '',
  phone: '',
  allergies: '',
  home_address: '1 Main St, Hayward CA',
  guardian_name: 'Sara Hanna',
  guardian_phone: '(510) 555-1234',
  guardian_email: 'sara@example.com',
  emergency_contact_name: 'Sara Hanna',
  emergency_contact_phone: '(510) 555-1234',
};
const registration = { grade: 5, division: 'juniors', tshirt_size: 'YM', top_sports: null };

const newKid = {
  mode: 'new',
  kid: { ...kidFields, first_name: 'Mina', last_name: 'Hanna', dob: '2014-03-05', gender: 'male' },
  registration,
  photo_path: PHOTO,
  consent: true,
};
const returning = { mode: 'returning', kid_id: KID, kid: kidFields, registration, consent: true };

const rpc = jest.fn();
const remove = jest.fn();
const storage = { from: jest.fn(() => ({ remove })) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(checkRole).mockResolvedValue({
    userId: 'user-id',
    hasRole: true,
    supabase: { rpc, storage },
  } as unknown as Awaited<ReturnType<typeof checkRole>>);
  rpc.mockResolvedValue({ data: [{ kid_id: KID, registration_id: 'reg-id', old_photo_path: null }], error: null });
  remove.mockResolvedValue({ data: [], error: null });
});

describe('registerKid -- the photo', () => {
  it('sends the uploaded photo to register_kid', async () => {
    await registerKid(newKid);

    expect(rpc).toHaveBeenCalledWith(
      'register_kid',
      expect.objectContaining({ p_kid_id: null, p_photo_path: PHOTO, p_consent: true })
    );
  });

  it('refuses a new kid with no photo before it reaches the database, beside the photo', async () => {
    const { photo_path: _omit, ...withoutPhoto } = newKid;
    void _omit;

    const result = await registerKid(withoutPhoto);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.photo_path).toEqual(['Add a photo of your kid']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lets a returning kid send none, because they may already have one on file', async () => {
    await registerKid(returning);

    expect(rpc).toHaveBeenCalledWith('register_kid', expect.objectContaining({ p_kid_id: KID, p_photo_path: null }));
  });

  it('sends a replacement for a returning kid', async () => {
    await registerKid({ ...returning, photo_path: PHOTO });

    expect(rpc).toHaveBeenCalledWith('register_kid', expect.objectContaining({ p_photo_path: PHOTO }));
  });

  it('deletes the replaced file, and only after the registration is saved', async () => {
    const order: string[] = [];
    rpc.mockImplementation(async () => {
      order.push('save');
      return { data: [{ kid_id: KID, registration_id: 'r', old_photo_path: OLD_PHOTO }], error: null };
    });
    remove.mockImplementation(async () => {
      order.push('remove');
      return { data: [], error: null };
    });

    expect(await registerKid({ ...returning, photo_path: PHOTO })).toMatchObject({ ok: true, kidId: KID });

    expect(remove).toHaveBeenCalledWith([OLD_PHOTO]);
    expect(order).toEqual(['save', 'remove']);
  });

  it('deletes nothing when there was nothing to replace', async () => {
    await registerKid(newKid);

    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the old file when the registration is refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '55006', message: 'on a team' } });

    const result = await registerKid({ ...returning, photo_path: PHOTO });

    expect(result.ok).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('still succeeds when the old file cannot be deleted', async () => {
    rpc.mockResolvedValue({ data: [{ kid_id: KID, registration_id: 'r', old_photo_path: OLD_PHOTO }], error: null });
    remove.mockResolvedValue({ data: null, error: { message: 'denied' } });

    expect((await registerKid({ ...returning, photo_path: PHOTO })).ok).toBe(true);
  });
});

describe('registerKid -- photo errors from the database', () => {
  it('maps "a photo is required" to the photo field', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22004', message: 'A photo is required' } });

    const result = await registerKid(returning);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual({ photo_path: ['Add a photo of your kid'] });
  });

  it('maps "the upload was not found" to the photo field', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '02000', message: 'Photo upload not found' } });

    const result = await registerKid(newKid);

    expect(result.error).toMatch(/not found/i);
    expect(result.fieldErrors).toEqual({ photo_path: ['Choose the photo again'] });
  });

  it('tells a reused photo from a duplicate kid, though both are 23505', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'That photo is already used by another kid' } });
    const reused = await registerKid(newKid);

    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'You have already added a kid with that name and date of birth' } });
    const duplicate = await registerKid(newKid);

    expect(reused.error).toMatch(/photo/i);
    expect(reused.fieldErrors).toEqual({ photo_path: ['Choose the photo again'] });
    expect(duplicate.error).toMatch(/already added a kid/i);
    expect(duplicate.fieldErrors).toBeUndefined();
  });

  it('logs only the error code, because a message can name a kid', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: `kid ${KID} photo ${PHOTO}` } });

    await registerKid(newKid);

    const logged = jest.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).toContain('XX000');
    expect(logged).not.toContain(PHOTO);
  });
});

describe('registerKid -- who may call it', () => {
  it('refuses a signed-out caller, and a caller who is not a parent', async () => {
    jest.mocked(checkRole).mockResolvedValue({ userId: null, hasRole: false, supabase: { rpc, storage } } as never);
    expect((await registerKid(newKid)).ok).toBe(false);

    jest.mocked(checkRole).mockResolvedValue({ userId: 'u', hasRole: false, supabase: { rpc, storage } } as never);
    expect((await registerKid(newKid)).ok).toBe(false);

    expect(rpc).not.toHaveBeenCalled();
  });
});
