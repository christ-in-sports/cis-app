'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import Papa from 'papaparse';
import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { startSeason } from '../actions';
import { BoardHeader } from '@/components/cis/board-shell';
import { Field, FieldError, SelectInput, TextInput } from '@/components/cis/form';
import { type Season, type SummaryRow } from '@/lib/attendance';
import { AttendanceSheet } from '../parts';
import { LiveAttendance } from '../live';

export default function SummaryClient({ isAdmin, seasons, seasonId, rows }: { isAdmin: boolean; seasons: Season[]; seasonId: string; rows: SummaryRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const team = params.get('team') ?? 'all';
  const teams = [...new Map(rows.filter((r) => r.team_id).map((r) => [r.team_id!, r.team_name ?? 'Team'])).entries()];
  const shown = rows.filter((r) => (team === 'all' || (r.team_id ?? 'none') === team) && `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString()); next.set(key, value);
    if (key === 'season') next.delete('team');
    router.replace(`/attendance/summary?${next}`);
  };
  return <>
    <LiveAttendance />
    <BoardHeader title="Attendance summary" />
    {isAdmin && <AttendanceSheet>
      <details><summary className="min-h-12 cursor-pointer py-3 font-bold">Start a new season</summary>
        <p className="py-3 text-cis-sm text-cis-ink-muted">This archives the current season. Attendance history stays available; the new season needs its own registrations and teams.</p>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get('name') ?? '');
          if (!window.confirm(`Archive the current season and start ${name}?`)) return;
          setError('');
          start(async () => {
            const result = await startSeason(name);
            if (!result.ok) setError(result.error);
            else { router.push(`/attendance/summary?season=${result.id}`); router.refresh(); }
          });
        }}>
          <Field label="New season name">{(props) => <TextInput {...props} name="name" required maxLength={100} />}</Field>
          {error && <FieldError>{error}</FieldError>}
          <PrimaryButton type="submit" disabled={pending}>{pending ? 'Starting…' : 'Start season'}</PrimaryButton>
        </form>
      </details>
    </AttendanceSheet>}
    <AttendanceSheet>
      <Field label="Season">{(props) => <SelectInput {...props} value={seasonId} onChange={(e) => change('season', e.target.value)}>
        {!seasons.length && <option value="">No seasons yet</option>}{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}{season.is_current ? ' (current)' : ''}</option>)}
      </SelectInput>}</Field>
      <Field label="Team">{(props) => <SelectInput {...props} value={team} onChange={(e) => change('team', e.target.value)}>
        <option value="all">All accessible teams</option><option value="none">No team</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </SelectInput>}</Field>
      <Field label="Search kids">{(props) => <TextInput {...props} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
      <p className="text-cis-sm text-cis-ink-muted">Present includes late arrivals. Percent uses marked days, including excused absences; unmarked days are excluded. Team assignments reflect the current season roster. Results refresh every 10 seconds.</p>
    </AttendanceSheet>
    <AttendanceSheet>
      <SecondaryButton disabled={!shown.length} onClick={() => {
        const csv = Papa.unparse(shown.map((row) => ({ First: row.first_name, Last: row.last_name, Grade: row.grade, Division: row.division, Team: row.team_name ?? '', Present: row.attended, Late: row.late, Absent: row.absent, Excused: row.excused, Unmarked: row.unmarked, Days: row.eligible, Percent: row.pct })), { escapeFormulae: true });
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a'); a.href = url; a.download = `attendance-${seasonId}.csv`; a.click(); URL.revokeObjectURL(url);
      }}>Export CSV</SecondaryButton>
      {!shown.length ? <p>No registrations match this view.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-cis-sm">
        <caption className="sr-only">Attendance by registered kid</caption>
        <thead className="border-b-4 border-cis-ink"><tr>{['Kid', 'Present', 'Marked', 'Unmarked', 'Percent'].map((label) => <th key={label} scope="col" className="px-2 py-3">{label}</th>)}</tr></thead>
        <tbody>{shown.map((row) => <tr key={row.registration_id} className="border-b border-cis-rule">
          <th scope="row" className="px-2 py-3 font-bold">{row.first_name} {row.last_name}<span className="block text-cis-xs font-normal text-cis-ink-muted">{row.team_name ?? 'No team'} · Grade {row.grade}</span></th>
          <td className="px-2 py-3">{row.attended}</td><td className="px-2 py-3">{row.eligible - row.unmarked}</td><td className="px-2 py-3">{row.unmarked}</td><td className="px-2 py-3">{row.pct}%</td>
        </tr>)}</tbody>
      </table></div>}
    </AttendanceSheet>
  </>;
}
