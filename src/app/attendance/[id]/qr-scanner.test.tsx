import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttendanceQrScanner } from './qr-scanner';
import { scanAttendance } from '../actions';

const refresh = jest.fn(), stop = jest.fn(), stopTrack = jest.fn();
const getUserMedia = jest.fn();
const router = { refresh };
let decode: (result: { getText: () => string }) => Promise<void>;
const decodeFromStream = jest.fn(async (_stream, _video, callback) => { decode = callback; return { stop }; });
jest.mock('next/navigation', () => ({ useRouter: () => router }));
jest.mock('../actions', () => ({ scanAttendance: jest.fn() }));
jest.mock('@zxing/browser', () => ({ BrowserQRCodeReader: jest.fn().mockImplementation(() => ({ decodeFromStream })) }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  jest.mocked(scanAttendance).mockResolvedValue({ ok: true, message: 'Test Kid — Present, saved.' });
});

it('requests only video after a tap, saves scans automatically and suppresses repeats', async () => {
  const view = render(<AttendanceQrScanner dayId="day-id" />);
  expect(getUserMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(decodeFromStream).toHaveBeenCalled());
  expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' } } });
  await act(() => decode({ getText: () => 'qr-code' }));
  expect(scanAttendance).toHaveBeenCalledWith({ dayId: 'day-id', code: 'qr-code' });
  expect(screen.getByRole('status')).toHaveTextContent('Test Kid — Present, saved.');
  await act(() => decode({ getText: () => 'qr-code' }));
  expect(scanAttendance).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(stop).toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalled();
});

it('shows save failures and permits a different kid to scan next', async () => {
  jest.mocked(scanAttendance).mockResolvedValueOnce({ ok: false, error: 'Nothing saved.' });
  render(<AttendanceQrScanner dayId="day-id" />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(decodeFromStream).toHaveBeenCalled());
  await act(() => decode({ getText: () => 'first-code' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing saved.');
  await act(() => decode({ getText: () => 'second-code' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(scanAttendance).toHaveBeenCalledTimes(2);
});

it('handles denied camera permission without losing manual attendance', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  render(<AttendanceQrScanner dayId="day-id" />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Camera permission was denied');
  expect(screen.getByRole('button', { name: 'Start camera' })).toBeEnabled();
});

it('releases a camera granted after the user has stopped the scanner', async () => {
  let grant!: (value: { getTracks: () => { stop: typeof stopTrack }[] }) => void;
  getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
  render(<AttendanceQrScanner dayId="day-id" />);
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
  await act(async () => grant({ getTracks: () => [{ stop: stopTrack }] }));
  expect(stopTrack).toHaveBeenCalled();
  expect(decodeFromStream).not.toHaveBeenCalled();
});
