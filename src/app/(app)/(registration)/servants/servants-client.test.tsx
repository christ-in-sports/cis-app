/**
 * Covers the Admin servants list: what the table shows, that a row opens to show
 * every field, search and the serving filter, and that Export CSV hands the
 * visible rows to a download.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import ServantsClient from './servants-client';
import type { ServantListRow } from '@/lib/registration/servant-list';

function row(over: Partial<ServantListRow> = {}): ServantListRow {
  return {
    id: 'r1',
    full_name: 'Mina Hanna',
    email: 'mina@test.local',
    phone: '(510) 555-1234',
    evaluation_status: 'completed',
    is_serving: true,
    sessions: ['juniors', 'ambassadors'],
    juniors_subteams: ['coaches', 'prayer'],
    ambassadors_subteams: [],
    juniors_other: null,
    ambassadors_other: 'Photography',
    notes: 'Prefer mornings',
    dates_missing: 'Feb 7',
    gender: 'male',
    dob: '1990-04-02',
    home_address: '1 Main St, Hayward, CA',
    emergency_contact_name: 'Sara Hanna',
    emergency_contact_phone: '(510) 555-9876',
    created_at: '2026-10-01T18:30:00Z',
    updated_at: '2026-10-02T18:30:00Z',
    ...over,
  };
}

const notServing = row({
  id: 'r2',
  full_name: 'Sara Youssef',
  email: 'sara@test.local',
  is_serving: false,
  sessions: [],
  juniors_subteams: [],
  ambassadors_subteams: [],
  ambassadors_other: null,
});

const rows = [row(), notServing];

const renderList = (over: Partial<React.ComponentProps<typeof ServantsClient>> = {}) =>
  render(<ServantsClient seasonName="CIS 2026-2027" rows={rows} loadFailed={false} {...over} />);

describe('Admin servants list', () => {
  it('shows each registration in a real table, with counts', () => {
    renderList();
    expect(screen.getByText('2 registered · 1 serving · 1 not serving')).toBeInTheDocument();

    const table = screen.getByRole('table');
    for (const name of ['Name', 'Serving', 'Sessions and teams', 'Phone', 'Updated']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }

    const mina = screen.getByRole('button', { name: 'Mina Hanna' }).closest('tr')!;
    expect(within(mina).getByText('Yes')).toBeInTheDocument();
    expect(within(mina).getByText('Coaches, Prayer Team')).toBeInTheDocument();
    expect(within(mina).getByText('Other: Photography')).toBeInTheDocument();
    expect(within(mina).getByText('(510) 555-1234')).toBeInTheDocument();

    const sara = screen.getByRole('button', { name: 'Sara Youssef' }).closest('tr')!;
    expect(within(sara).getByText('No')).toBeInTheDocument();
  });

  it('opens a row to every field, and closes it again', () => {
    renderList();
    expect(screen.queryByText('1 Main St, Hayward, CA')).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Mina Hanna' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    for (const text of [
      'mina@test.local',
      'Completed',
      'Prefer mornings',
      'Feb 7',
      'Male',
      'April 2, 1990',
      '1 Main St, Hayward, CA',
      'Sara Hanna, (510) 555-9876',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }

    fireEvent.click(button);
    expect(screen.queryByText('1 Main St, Hayward, CA')).not.toBeInTheDocument();
  });

  it('searches by name or email', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('Search servants'), { target: { value: 'sara@' } });
    expect(screen.getByRole('button', { name: 'Sara Youssef' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mina Hanna' })).not.toBeInTheDocument();
  });

  it('filters to those serving or not serving', () => {
    renderList();
    fireEvent.click(screen.getByLabelText('Not serving'));
    expect(screen.queryByRole('button', { name: 'Mina Hanna' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sara Youssef' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Serving'));
    expect(screen.getByRole('button', { name: 'Mina Hanna' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sara Youssef' })).not.toBeInTheDocument();
  });

  it('exports only the rows on screen as a CSV download', async () => {
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderList();
    fireEvent.change(screen.getByLabelText('Search servants'), { target: { value: 'mina' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(click).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toContain('Mina Hanna');
    expect(text).not.toContain('Sara Youssef');
    click.mockRestore();
  });

  it('says when nobody has registered, and when the search finds nobody', () => {
    const { unmount } = renderList({ rows: [] });
    expect(screen.getByText('No registrations yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    unmount();

    renderList();
    fireEvent.change(screen.getByLabelText('Search servants'), { target: { value: 'zzz' } });
    expect(screen.getByText('No servants match')).toBeInTheDocument();
  });

  it('tells the Admin when the registrations could not be loaded', () => {
    renderList({ rows: [], loadFailed: true });
    expect(screen.getByText('Could not load registrations')).toBeInTheDocument();
  });
});
