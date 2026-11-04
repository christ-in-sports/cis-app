'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { type RosterKid, type MinistryTeam, DIVISION_SHORT, fmtDay } from '@/lib/attendance';
import { Field, FieldError, SelectInput, TextInput, TickRow } from '@/components/cis/form';
import { DangerButton, PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { KidAvatar } from '@/components/cis/kid-avatar';
import { SheetHeading } from '@/components/cis/sheet';
import { AttendanceSheet } from '../attendance/parts';
import { assignCoach, assignKids, createTeam, deleteTeam, renameTeam } from './actions';

type Coach = { id: string; display_name: string };
type Link = { team_id: string; user_id: string };

export default function TeamsClient({ archived, teams, kids, coaches, links }: {
  archived: boolean; teams: MinistryTeam[]; kids: RosterKid[]; coaches: Coach[]; links: Link[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const division = params.get('division') === 'ambassadors' ? 'ambassadors' : 'juniors';
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const inDivision = teams.filter((t) => t.division === division);
  const shown = kids.filter((kid) => kid.division === division && `${kid.first_name} ${kid.last_name}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

  const run = (work: () => ReturnType<typeof assignKids>, success: string) => {
    setError(''); setMessage('');
    start(async () => {
      const result = await work();
      if (!result.ok) setError(result.error);
      else { setMessage(success); setSelected([]); setTarget(''); router.refresh(); }
    });
  };
  return <>
    <AttendanceSheet>
      <p>{archived ? 'Past teams, kids and coach assignments are saved here. New teams are managed in Current teams.' : 'Create teams, assign registered kids, and choose any number of coaches for each team. Only users with the Coach role appear here; an Admin grants roles.'}</p>
      <Field label="Teams">{(props) => <SelectInput {...props} disabled={pending} value={archived ? 'archive' : 'current'} onChange={(e) => {
        setSelected([]); setTarget(''); setMessage(''); setError('');
        const next = new URLSearchParams(params.toString()); next.set('view', e.target.value);
        router.replace(`${pathname}?${next}`);
      }}><option value="current">Current teams</option><option value="archive">Archived teams</option></SelectInput>}</Field>
      <Field label="Division">{(props) => <SelectInput {...props} disabled={pending} value={division} onChange={(e) => {
        setSelected([]); setTarget(''); setSearch(''); setMessage(''); setError('');
        const next = new URLSearchParams(params.toString()); next.set('division', e.target.value);
        router.replace(`${pathname}?${next}`);
      }}><option value="juniors">Juniors</option><option value="ambassadors">Ambassadors</option></SelectInput>}</Field>
      {error && <FieldError>{error}</FieldError>}
      <p role="status">{pending ? 'Saving…' : message}</p>
      {!archived && <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = new FormData(form).get('name');
        run(() => createTeam({ name, division }), 'Team created.');
      }}>
        <Field label="New team name">{(props) => <TextInput {...props} name="name" required maxLength={80} placeholder="Lions" />}</Field>
        <PrimaryButton type="submit" disabled={pending}>Create team</PrimaryButton>
      </form>}
    </AttendanceSheet>
    <AttendanceSheet>
      <SheetHeading>{DIVISION_SHORT[division]} teams</SheetHeading>
      {!inDivision.length && <p>{archived ? 'No archived teams in this division.' : 'No teams yet. Create one above, then assign kids below.'}</p>}
      {inDivision.map((team) => <section key={team.id} className="border-b border-cis-rule py-4 last:border-0">
        <h3 className="font-cis-display text-cis-lg">{team.name}</h3>
        {team.archived_at && <p className="text-cis-sm text-cis-ink-muted">Archived {fmtDay(team.archived_at.slice(0, 10))}</p>}
        <p className="py-2 text-cis-sm text-cis-ink-muted">{kids.filter((k) => k.team_id === team.id).length} kids · {links.filter((l) => l.team_id === team.id).length} coaches</p>
        {archived ? <>
          <p className="text-cis-sm">Coaches: {links.filter((link) => link.team_id === team.id).map((link) => coaches.find((coach) => coach.id === link.user_id)?.display_name ?? 'Former coach').join(', ') || 'None assigned'}</p>
          <details><summary className="min-h-12 cursor-pointer py-3 font-bold">View roster</summary>
            <ul>{kids.filter((kid) => kid.team_id === team.id).map((kid) => <li key={kid.id} className="py-2">{kid.first_name} {kid.last_name} · Grade {kid.grade}</li>)}</ul>
          </details>
        </> : <>
        <details><summary className="min-h-12 cursor-pointer py-3 font-bold">Edit team</summary>
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const name = new FormData(event.currentTarget).get('name');
            run(() => renameTeam({ teamId: team.id, name }), 'Team renamed.');
          }}>
            <Field label={`Team name for ${team.name}`}>{(props) => <TextInput {...props} name="name" defaultValue={team.name} required maxLength={80} />}</Field>
            <div className="flex flex-wrap gap-3">
              <SecondaryButton type="submit" disabled={pending}>Save team name</SecondaryButton>
              <DangerButton type="button" disabled={pending} onClick={() => {
                if (window.confirm(`Delete ${team.name}? Kids will be unassigned and coach assignments removed. Attendance marks and existing sports games and scores will be kept.`)) run(() => deleteTeam(team.id), 'Team deleted. Kids are ready to assign to another team.');
              }}>Delete team</DangerButton>
            </div>
          </form>
        </details>
        <details><summary className="min-h-12 cursor-pointer py-3 font-bold">Assign coaches</summary>
          <fieldset disabled={pending} className="space-y-2">
            <legend className="sr-only">Coaches for {team.name}</legend>
            {!coaches.length && <p>Ask an Admin to grant the Coach role to your coaches.</p>}
            {coaches.map((coach) => {
              const checked = links.some((link) => link.team_id === team.id && link.user_id === coach.id);
              return <TickRow key={coach.id} checked={checked} onChange={(checked) => run(() => assignCoach(team.id, coach.id, checked), 'Coach assignments saved.')} >{coach.display_name}</TickRow>;
            })}
          </fieldset>
        </details>
        </>}
      </section>)}
    </AttendanceSheet>
    {!archived && <AttendanceSheet>
      <SheetHeading>Assign registered kids</SheetHeading>
      <p className="text-cis-sm text-cis-ink-muted">{kids.filter((k) => k.division === division && !k.team_id).length} kids without a team in this division. Assignments are shared with Attendance and Sports. Archived attendance keeps its saved roster.</p>
      <Field label="Search kids">{(props) => <TextInput {...props} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
      <fieldset disabled={pending} className="space-y-2">
        <legend className="sr-only">Select kids to assign</legend>
        {!shown.length && <p>No registered kids match. Registrations arrive through the parent form or Admin CSV import.</p>}
        {shown.map((kid) => <TickRow key={kid.id} checked={selected.includes(kid.id)}
          onChange={(checked) => setSelected((prev) => checked ? [...prev, kid.id] : prev.filter((id) => id !== kid.id))}
          ><span className="flex items-center gap-3">
            <KidAvatar size="sm" firstName={kid.first_name} lastName={kid.last_name} photo={kid.photo} />
            <span className="min-w-0"><span className="block font-bold">{kid.first_name} {kid.last_name}</span>
              <span className="block text-cis-sm text-cis-ink-muted">Grade {kid.grade} · {teams.find((team) => team.id === kid.team_id)?.name ?? 'No team'}</span></span>
          </span></TickRow>)}
      </fieldset>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => assignKids({ ids: selected, teamId: target || null }), 'Team assignments saved.'); }}>
        <Field label={`Assign ${selected.length} selected kids to`}>{(props) => <SelectInput {...props} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">No team</option>{inDivision.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </SelectInput>}</Field>
        <PrimaryButton block type="submit" disabled={pending || !selected.length}>Save assignments</PrimaryButton>
      </form>
    </AttendanceSheet>}
  </>;
}
