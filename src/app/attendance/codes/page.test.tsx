import { redirect } from 'next/navigation';
import { attendanceAccess } from '../data';
import AttendanceCodesIndex from './page';
import { render, screen } from '@testing-library/react';

jest.mock('../data', () => ({ attendanceAccess: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn(() => { throw new Error('REDIRECT'); }) }));
const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(attendanceAccess).mockResolvedValue({ supabase: { rpc } } as unknown as Awaited<ReturnType<typeof attendanceAccess>>);
});

it('opens the newest populated accessible day instead of an empty day', async () => {
  rpc.mockResolvedValue({ data: [{ id: 'empty', total: 0 }, { id: 'newest', total: 4 }, { id: 'older', total: 8 }], error: null });
  await expect(AttendanceCodesIndex()).rejects.toThrow('REDIRECT');
  expect(rpc).toHaveBeenCalledWith('attendance_days_overview', { p_archived: false });
  expect(redirect).toHaveBeenCalledWith('/attendance/newest/codes');
});

it('provides a way back when no accessible roster exists', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  render(await AttendanceCodesIndex());
  expect(screen.getByText(/No current attendance roster/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to attendance' })).toHaveAttribute('href', '/attendance');
  expect(redirect).not.toHaveBeenCalled();
});

it('reports a failed lookup instead of treating it as an empty roster', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'failed' } });
  await expect(AttendanceCodesIndex()).rejects.toThrow('Could not load QR card rosters.');
});
