import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttendanceRow } from './attendance-row';
import type { AttendanceRecord, RosterKid } from '@/lib/attendance';

const kid: RosterKid = { id: 'registration', kid_id: 'kid', first_name: 'Test', last_name: 'Player', grade: 6, division: 'juniors', team_id: 'team' };
const record: AttendanceRecord = { id: 'record', registration_id: kid.id, day_id: 'day', status: 'unmarked', method: 'manual', marked_at: null, note: '' };

it('shows a failed mark and does not claim it was saved', async () => {
  const save = jest.fn().mockResolvedValue({ ok: false, error: 'Attendance day is locked' });
  render(<AttendanceRow kid={kid} record={record} teamName="Lions" disabled={false} save={save} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'present' } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('locked'));
  expect(save).toHaveBeenCalledWith('present', undefined);
  expect(screen.getByRole('combobox')).toHaveValue('unmarked');
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
});

it('blocks overlapping saves while the server is working', async () => {
  let finish!: (result: { ok: true }) => void;
  const save = jest.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<AttendanceRow kid={kid} record={record} teamName="Lions" disabled={false} save={save} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'late' } });
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  finish({ ok: true });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
});

it('disables marking and notes for viewers and locked sessions', () => {
  render(<AttendanceRow kid={kid} record={record} teamName="Lions" disabled save={jest.fn()} />);
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save note', hidden: true })).toBeDisabled();
});

describe('the kid’s photo', () => {
  it('shows the face beside the name, so a coach can match who is in front of them', () => {
    const { container } = render(
      <AttendanceRow
        kid={{ ...kid, photo: { photoPath: 'a.webp', signedUrl: 'https://signed/a' } }}
        record={record} teamName="Lions" disabled={false} save={jest.fn()}
      />
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/a');
    expect(screen.getByText('Test Player')).toBeInTheDocument();
  });

  it('shows the initials when there is no photo, as on archived days', () => {
    const { container } = render(
      <AttendanceRow kid={kid} record={record} teamName="Lions" disabled={false} save={jest.fn()} />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('TP')).toBeInTheDocument();
  });

  it('keeps showing the same photo link while the roster refreshes underneath it', () => {
    const photo = (t: number) => ({ photoPath: 'a.webp', signedUrl: `https://signed/a?t=${t}` });
    const { container, rerender } = render(
      <AttendanceRow kid={{ ...kid, photo: photo(1) }} record={record} teamName="Lions" disabled={false} save={jest.fn()} />
    );

    rerender(<AttendanceRow kid={{ ...kid, photo: photo(2) }} record={record} teamName="Lions" disabled={false} save={jest.fn()} />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/a?t=1');
  });
});
