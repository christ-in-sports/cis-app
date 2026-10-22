import { scanAttendance } from './actions';
import { getMyRoles } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';
import { attendanceQrValue } from '@/lib/attendance-qr';

jest.mock('@/lib/auth/roles', () => ({ getMyRoles: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
const kidId = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';
const dayId = 'c885f8bc-347d-4a99-82ea-d36bb1b35554';
const input = { dayId, code: attendanceQrValue(kidId) };
const row = { id: 'record-id', kid_id: kidId, first_name: 'Test', last_name: 'Kid', status: 'unmarked' };
const day = jest.fn(), update = jest.fn(), rpc = jest.fn(), select = jest.fn();
const query = { eq: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), select };
const from = jest.fn((table: string) => table === 'attendance_days'
  ? { select: () => ({ eq: () => ({ maybeSingle: day }) }) }
  : { update });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getMyRoles).mockResolvedValue({ userId: 'user-id', roles: new Set(['coach']), supabase: { from, rpc } } as unknown as Awaited<ReturnType<typeof getMyRoles>>);
  day.mockResolvedValue({ data: { locked: false, archived_at: null }, error: null });
  rpc.mockResolvedValue({ data: [row], error: null });
  update.mockReturnValue(query);
  select.mockResolvedValue({ data: [{ id: row.id }], error: null });
});

it('marks the server-resolved row present without overwriting its note', async () => {
  expect(await scanAttendance(input)).toEqual({ ok: true, message: 'Test Kid — Present, saved.' });
  expect(rpc).toHaveBeenCalledWith('attendance_day_roster', { p_day: dayId });
  expect(update).toHaveBeenCalledWith({ status: 'present' });
  expect(query.eq).toHaveBeenCalledWith('day_id', dayId);
  expect(query.eq).toHaveBeenCalledWith('id', row.id);
  expect(query.in).toHaveBeenCalledWith('status', ['unmarked', 'absent', 'excused']);
  expect(revalidatePath).toHaveBeenCalled();
});

it.each(['present', 'late'])('leaves an existing %s mark and its audit stamp unchanged', async (status) => {
  rpc.mockResolvedValue({ data: [{ ...row, status }], error: null });
  expect(await scanAttendance(input)).toEqual({ ok: true, message: `Test Kid is already ${status}.` });
  expect(update).not.toHaveBeenCalled();
});

it.each([[], ['program'], ['parent']].map((roles) => ({ roles })))('rejects unauthorized roles $roles before reading the roster', async ({ roles }) => {
  jest.mocked(getMyRoles).mockResolvedValue({ userId: 'user-id', roles: new Set(roles), supabase: { from, rpc } } as unknown as Awaited<ReturnType<typeof getMyRoles>>);
  expect((await scanAttendance(input)).ok).toBe(false);
  expect(from).not.toHaveBeenCalled();
});

it.each([{ locked: true, archived_at: null }, { locked: false, archived_at: '2026-10-22' }])('rejects closed days %j', async (closed) => {
  day.mockResolvedValue({ data: closed, error: null });
  expect((await scanAttendance(input)).ok).toBe(false);
  expect(update).not.toHaveBeenCalled();
});

it('rejects kids outside the authenticated roster without disclosing their name', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await scanAttendance(input)).toEqual({ ok: false, error: 'This code is not on your accessible roster for this day.' });
  expect(update).not.toHaveBeenCalled();
});

it('reports denied or zero-row updates as failures, never as a saved mark', async () => {
  select.mockResolvedValue({ data: [], error: null });
  expect((await scanAttendance(input)).ok).toBe(false);
  expect(revalidatePath).not.toHaveBeenCalled();
});

it('rejects arbitrary QR payloads before querying attendance', async () => {
  expect((await scanAttendance({ ...input, code: 'https://example.com' })).ok).toBe(false);
  expect(from).not.toHaveBeenCalled();
});
