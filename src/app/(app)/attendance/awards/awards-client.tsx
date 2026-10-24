'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Papa from 'papaparse';
import { BoardHeader } from '@/components/cis/board-shell';
import { SecondaryButton } from '@/components/cis/button';
import { Field, SelectInput, TextInput } from '@/components/cis/form';
import { DIVISION_SHORT, type SummaryRow } from '@/lib/attendance';
import { attendanceRanks, sortAttendance } from '@/lib/attendance-awards';
import { AttendanceSheet } from '../parts';
import { LiveAttendance } from '../live';

export default function AwardsClient({ archived, rows }: { archived: boolean; rows: SummaryRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const division = params.get('division') === 'ambassadors' ? 'ambassadors' : 'juniors';
  const team = params.get('team') ?? 'all';
  const sort = params.get('sort') ?? 'attendance';
  const divisionRows = rows.filter((row) => row.division === division);
  const teams = [...new Map(divisionRows.filter((row) => row.team_id).map((row) => [row.team_id!, row.team_name ?? 'Team'])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const ranks = attendanceRanks(rows);
  const shown = sortAttendance(divisionRows.filter((row) => (team === 'all' || (row.team_id ?? 'none') === team)
    && `${row.first_name} ${row.last_name}`.toLowerCase().includes(search.toLowerCase())), sort);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString()); next.set(key, value);
    if (key === 'division') next.delete('team');
    router.replace(`/attendance/awards?${next}`);
  };
  return <>
    <LiveAttendance />
    <BoardHeader title="Attendance awards" />
    <AttendanceSheet>
      <div className="grid grid-cols-2 gap-4">
      <Field label="Division">{(props) => <SelectInput {...props} value={division} onChange={(e) => change('division', e.target.value)}>
        <option value="juniors">Juniors</option><option value="ambassadors">Ambassadors</option>
      </SelectInput>}</Field>
      <Field label="Attendance">{(props) => <SelectInput {...props} value={archived ? 'archive' : 'current'} onChange={(e) => change('view', e.target.value)}>
        <option value="current">Current</option><option value="archive">Archived</option>
      </SelectInput>}</Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
      <Field label="Team">{(props) => <SelectInput {...props} value={team} onChange={(e) => change('team', e.target.value)}>
        <option value="all">All teams</option><option value="none">No team</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </SelectInput>}</Field>
      <Field label="Sort by">{(props) => <SelectInput {...props} value={sort} onChange={(e) => change('sort', e.target.value)}>
        <option value="attendance">Days present</option><option value="percent">Percent</option><option value="team">Team name</option><option value="name">Kid name</option>
      </SelectInput>}</Field>
      </div>
      <Field label="Search kids">{(props) => <TextInput {...props} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
      <details className="text-cis-sm text-cis-ink-muted">
        <summary className="min-h-11 cursor-pointer py-3 font-bold">How ranks work</summary>
        <p>Everyone on the current registered roster is included, even with no attendance. Rank uses days present, including late arrivals, within the full division; ties share a rank. Team filters do not change ranks.</p>
        <p className="mt-3">Percent uses marked days, including excused absences. Check unmarked days before choosing awards. Kids with no marked attendance have no rank. Archived results use this same roster; past rosters remain in <Link className="underline" href="/attendance/summary?view=archive">the archived summary</Link>.</p>
      </details>
    </AttendanceSheet>
    <AttendanceSheet>
      <p role="status">{shown.length} {DIVISION_SHORT[division]} kids</p>
      <SecondaryButton disabled={!shown.length} onClick={() => {
        const csv = Papa.unparse(shown.map((row) => ({ Rank: ranks.get(row.registration_id) ?? '', First: row.first_name, Last: row.last_name, Division: DIVISION_SHORT[row.division], Team: row.team_name ?? 'No team', Present: row.attended, Late: row.late, Absent: row.absent, Excused: row.excused, Marked: row.eligible - row.unmarked, Unmarked: row.unmarked, Percent: row.eligible > row.unmarked ? row.pct : '' })), { escapeFormulae: true });
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a'); a.href = url; a.download = `attendance-awards-${division}-${archived ? 'archive' : 'current'}.csv`; a.click(); URL.revokeObjectURL(url);
      }}>Export CSV</SecondaryButton>
      {!shown.length ? <p>No registered kids match these filters.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-cis-sm">
        <caption className="sr-only">{DIVISION_SHORT[division]} attendance award standings</caption>
        <thead className="border-b-4 border-cis-ink"><tr>{['Rank', 'Kid', 'Present', 'Marked', 'Unmarked', 'Percent'].map((label) => <th key={label} scope="col" className="px-2 py-3">{label}</th>)}</tr></thead>
        <tbody>{shown.map((row) => <tr key={row.registration_id} className="border-b border-cis-rule">
          <td className="px-2 py-3">{ranks.get(row.registration_id) ?? '—'}</td>
          <th scope="row" className="px-2 py-3 font-bold">{row.first_name} {row.last_name}<span className="block text-cis-xs font-normal text-cis-ink-muted">{row.team_name ?? 'No team'} · Grade {row.grade}</span></th>
          <td className="px-2 py-3">{row.attended}</td><td className="px-2 py-3">{row.eligible - row.unmarked}</td><td className="px-2 py-3">{row.unmarked}</td><td className="px-2 py-3">{row.eligible > row.unmarked ? `${row.pct}%` : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
    </AttendanceSheet>
  </>;
}
