'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { type RosterKid, type MinistryTeam, DIVISION_SHORT } from '@/lib/attendance';
import { Field, FieldError, SelectInput, TextInput, TickRow } from '@/components/cis/form';
import { PrimaryButton } from '@/components/cis/button';
import { SheetHeading } from '@/components/cis/sheet';
import { AttendanceSheet } from '../parts';
import { assignCoach, assignKids, createTeam } from '../actions';

type Coach = { id: string; display_name: string };
type Link = { team_id: string; user_id: string };

export default function TeamsClient({ teams, kids, coaches, links }: {
  teams: MinistryTeam[]; kids: RosterKid[]; coaches: Coach[]; links: Link[];
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
      else { setMessage(success); setSelected([]); router.refresh(); }
    });
  };
  return <>
    <AttendanceSheet>
      <p>Create teams, assign registered kids, and choose any number of coaches for each team. Only users with the Coach role appear here; an Admin grants roles.</p>
      <Field label="Division">{(props) => <SelectInput {...props} value={division} onChange={(e) => {
        setSelected([]); setTarget(''); setSearch('');
        const next = new URLSearchParams(params.toString()); next.set('division', e.target.value);
        router.replace(`${pathname}?${next}`);
      }}><option value="juniors">Juniors</option><option value="ambassadors">Ambassadors</option></SelectInput>}</Field>
      {error && <FieldError>{error}</FieldError>}
      <p role="status">{pending ? 'Saving…' : message}</p>
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = new FormData(form).get('name');
        run(() => createTeam({ name, division }), 'Team created.');
      }}>
        <Field label="New team name">{(props) => <TextInput {...props} name="name" required maxLength={80} placeholder="Lions" />}</Field>
        <PrimaryButton type="submit" disabled={pending}>Create team</PrimaryButton>
      </form>
    </AttendanceSheet>
    <AttendanceSheet>
      <SheetHeading>{DIVISION_SHORT[division]} teams</SheetHeading>
      {!inDivision.length && <p>No teams yet. Create one above, then assign kids below.</p>}
      {inDivision.map((team) => <section key={team.id} className="border-b border-cis-rule py-4 last:border-0">
        <h3 className="font-cis-display text-cis-lg">{team.name}</h3>
        <p className="py-2 text-cis-sm text-cis-ink-muted">{kids.filter((k) => k.team_id === team.id).length} kids · {links.filter((l) => l.team_id === team.id).length} coaches</p>
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
      </section>)}
    </AttendanceSheet>
    <AttendanceSheet>
      <SheetHeading>Assign registered kids</SheetHeading>
      <p className="text-cis-sm text-cis-ink-muted">{kids.filter((k) => k.division === division && !k.team_id).length} kids without a team in this division. Assignments apply to attendance days using this roster.</p>
      <Field label="Search kids">{(props) => <TextInput {...props} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
      <fieldset disabled={pending} className="space-y-2">
        <legend className="sr-only">Select kids to assign</legend>
        {!shown.length && <p>No registered kids match. Registrations arrive through the parent form or Admin CSV import.</p>}
        {shown.map((kid) => <TickRow key={kid.id} checked={selected.includes(kid.id)}
          onChange={(checked) => setSelected((prev) => checked ? [...prev, kid.id] : prev.filter((id) => id !== kid.id))}
          ><span className="block font-bold">{kid.first_name} {kid.last_name}</span>
          <span className="block text-cis-sm text-cis-ink-muted">Grade {kid.grade} · {teams.find((team) => team.id === kid.team_id)?.name ?? 'No team'}</span></TickRow>)}
      </fieldset>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => assignKids({ ids: selected, teamId: target || null }), 'Team assignments saved.'); }}>
        <Field label={`Assign ${selected.length} selected kids to`}>{(props) => <SelectInput {...props} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">No team</option>{inDivision.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </SelectInput>}</Field>
        <PrimaryButton block type="submit" disabled={pending || !selected.length}>Save assignments</PrimaryButton>
      </form>
    </AttendanceSheet>
  </>;
}
