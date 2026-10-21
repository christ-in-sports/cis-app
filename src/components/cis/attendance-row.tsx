'use client';

import { useState, useTransition } from 'react';
import { Field, FieldError, SelectInput, TextInput } from './form';
import { PrimaryButton } from './button';
import { type AttendanceRecord, type RosterKid, type AttStatus } from '@/lib/attendance';

export const ATTENDANCE_LABELS: Record<AttStatus, string> = {
  unmarked: 'Unmarked', present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused',
};

/** A row saves one mark at a time and shows success only after the server saves.
 * Draft notes stay local while refreshed marks from other coaches arrive. */
export function AttendanceRow({ record, kid, teamName, disabled, save }: {
  record: AttendanceRecord; kid: RosterKid; teamName: string; disabled: boolean;
  save: (status: AttStatus, note?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState(record.note ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const mark = (status: AttStatus, text?: string) => {
    setError(''); setSaved(false);
    start(async () => {
      const result = await save(status, text);
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  };
  return <li className="space-y-3 border-b border-cis-rule py-4 last:border-0">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-cis-md font-bold">{kid.first_name} {kid.last_name}</p>
        <p className="text-cis-sm text-cis-ink-muted">Grade {kid.grade} · {teamName}</p></div>
      <span className={record.status === 'present' ? 'rounded-cis-chip bg-cis-orange px-3 py-2 font-bold text-cis-ink-dark' : 'py-2 font-bold'}>{ATTENDANCE_LABELS[record.status]}</span>
    </div>
    <Field label={`Attendance for ${kid.first_name} ${kid.last_name}`}>{(props) => <SelectInput {...props} value={record.status} disabled={disabled || pending}
      onChange={(e) => mark(e.target.value as AttStatus)}>
      {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </SelectInput>}</Field>
    <details><summary className="min-h-11 cursor-pointer py-2 font-bold">Attendance note{record.note ? ' (saved)' : ''}</summary>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mark(record.status, note); }}>
        <Field label="Note" optional hint="Only Admin, Program and this team’s coaches can read this note.">{(props) => <TextInput {...props} value={note} maxLength={1000} disabled={disabled || pending} onChange={(e) => setNote(e.target.value)} />}</Field>
        <PrimaryButton type="submit" disabled={disabled || pending}>Save note</PrimaryButton>
      </form>
    </details>
    {error && <FieldError>{error}</FieldError>}
    <p role="status" className="text-cis-sm text-cis-ink-muted">{pending ? 'Saving…' : saved ? 'Saved' : ''}</p>
  </li>;
}
