'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { BoardHeader } from '@/components/cis/board-shell';
import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { AttendanceRow } from '@/components/cis/attendance-row';
import { Field, FieldError, SelectInput, TextInput } from '@/components/cis/form';
import { SheetHeading } from '@/components/cis/sheet';
import { type AttendanceDay, type AttendanceRecord, type RosterKid, type MinistryTeam, fmtDay } from '@/lib/attendance';
import { AttendanceSheet } from '../parts';
import { LiveAttendance } from '../live';
import { saveMarks, lockAttendance, refreshAttendance } from '../actions';

export default function TakeClient({ day, groupName, records, kids, teams, myTeamIds, canManage, isAdmin, isCoach }: {
  day: AttendanceDay; groupName: string; records: AttendanceRecord[]; kids: RosterKid[]; teams: MinistryTeam[];
  myTeamIds: string[]; canManage: boolean; isAdmin: boolean; isCoach: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const teamId = params.get('team') ?? (canManage ? 'all' : myTeamIds[0] ?? 'all');
  const canMark = (kid: RosterKid) => isAdmin || (isCoach && !!kid.team_id && myTeamIds.includes(kid.team_id));
  const availableTeams = teams.filter((team) => canManage || myTeamIds.includes(team.id));
  const visible = records.flatMap((record) => {
    const kid = kids.find((kid) => kid.id === record.registration_id);
    return kid && (teamId === 'all' || (teamId === 'none' ? !kid.team_id : kid.team_id === teamId))
      && `${kid.first_name} ${kid.last_name}`.toLowerCase().includes(search.toLowerCase()) ? [{ record, kid }] : [];
  }).sort((a, b) => a.kid.last_name.localeCompare(b.kid.last_name) || a.kid.first_name.localeCompare(b.kid.first_name));
  const present = visible.filter(({ record }) => ['present', 'late'].includes(record.status)).length;
  const unmarked = visible.filter(({ record }) => record.status === 'unmarked');
  const markable = unmarked.filter(({ kid }) => canMark(kid));
  const run = (work: () => ReturnType<typeof lockAttendance>, text: string) => {
    setError(''); setMessage('');
    start(async () => {
      const result = await work();
      if (!result.ok) setError(result.error);
      else { setMessage(text); router.refresh(); }
    });
  };
  return <>
    <LiveAttendance />
    <BoardHeader title={day.label || groupName} kicker={fmtDay(day.date)} />
    <AttendanceSheet>
      <SheetHeading>{day.locked ? 'Attendance locked' : 'Attendance open'}</SheetHeading>
      <p>{day.locked ? 'An Admin or Program Team member can reopen this session.' : 'Changes save as you go. Results refresh every 10 seconds.'}</p>
      <Field label="Team">{(props) => <SelectInput {...props} value={teamId} onChange={(e) => {
        const next = new URLSearchParams(params.toString()); next.set('team', e.target.value); router.replace(`${pathname}?${next}`);
      }}>
        <option value="all">All accessible teams</option>
        {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        {canManage && <option value="none">No team assigned</option>}
      </SelectInput>}</Field>
      <Field label="Search this roster">{(props) => <TextInput {...props} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
      <p role="status" className="font-bold">{present} / {visible.length} present · {unmarked.length} unmarked</p>
      {canManage && <div className="flex flex-wrap gap-3">
        <SecondaryButton disabled={pending} onClick={() => run(() => lockAttendance(day.id, !day.locked), day.locked ? 'Session reopened.' : 'Attendance locked.')}>{day.locked ? 'Reopen attendance' : 'Lock attendance'}</SecondaryButton>
        {!day.locked && <SecondaryButton disabled={pending} onClick={() => run(() => refreshAttendance(day.id), 'Roster refreshed. Existing marks were kept.')}>Add new registrations</SecondaryButton>}
      </div>}
      {error && <FieldError>{error}</FieldError>}<p role="status">{pending ? 'Saving…' : message}</p>
    </AttendanceSheet>
    {canManage && teamId === 'all' && <AttendanceSheet>
      <SheetHeading>Team progress</SheetHeading>
      <ul>{[...availableTeams, { id: 'none', name: 'No team assigned' }].map((team) => {
        const rows = records.filter((r) => kids.some((kid) => kid.id === r.registration_id && (kid.team_id ?? 'none') === team.id));
        if (!rows.length) return null;
        return <li key={team.id} className="border-b border-cis-rule py-3"><span className="font-bold">{team.name}</span> · {rows.filter((r) => r.status !== 'unmarked').length} / {rows.length} marked</li>;
      })}</ul>
    </AttendanceSheet>}
    <AttendanceSheet>
      <SheetHeading>Team roster</SheetHeading>
      {!visible.length && <p>{!canManage && !myTeamIds.length ? 'You have no assigned teams. Ask Admin or Program Team to assign you.' : 'No kids match this list. Check team assignments or add new registrations.'}</p>}
      {!day.locked && markable.length > 0 && <PrimaryButton disabled={pending} onClick={() => {
        if (window.confirm(`Mark the ${markable.length} visible, unmarked kids present?`)) run(() => saveMarks({ dayId: day.id, ids: markable.map(({ record }) => record.id), status: 'present', onlyUnmarked: true }), 'Unmarked kids saved as present.');
      }}>Mark {markable.length} unmarked present</PrimaryButton>}
      <ul>{visible.map(({ record, kid }) => <AttendanceRow key={`${record.id}:${record.note}`} record={record} kid={kid}
        teamName={teams.find((team) => team.id === kid.team_id)?.name ?? 'No team'} disabled={pending || day.locked || !canMark(kid)}
        save={async (status, note) => {
          const result = await saveMarks({ dayId: day.id, ids: [record.id], status, note });
          if (result.ok) router.refresh();
          return result;
        }} />)}</ul>
    </AttendanceSheet>
  </>;
}
