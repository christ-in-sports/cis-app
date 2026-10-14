'use client';

/**
 * Create or edit a sport block. Once a block has games its sport, division,
 * format and league structure are locked (the database refuses to change them),
 * so they show as locked values with the reason; dates and settings stay
 * editable and never touch the games.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { ChoiceGroup, Field, TextInput } from '@/components/cis/form';
import { LockedField } from '@/components/cis/manage-parts';
import { DIVISION_NAME, DIVISION_ORDER, sportLabel } from '@/lib/competition/labels';
import { formatNote, lockedNote } from '@/lib/competition/manage';
import { SPORTS, isKnownSport, sportSettings, type KnownSport } from '@/lib/competition/scores';

import { saveSportBlock } from '../actions';
import { FormFrame, FormSection } from './form-frame';

type Division = (typeof DIVISION_ORDER)[number];
type Format = 'league' | 'knockout' | 'league_knockout';
type Structure = 'round_robin' | 'groups';

export interface BlockFormValues {
  id?: string;
  division: Division;
  sport: string;
  format: Format;
  leagueStructure: Structure;
  startsOn: string;
  endsOn: string;
  settings: { gameMinutes?: number; maxSets?: number; maxRounds?: number };
}

const SPORT_CHOICES = (Object.keys(SPORTS) as KnownSport[]).map((value) => ({ value, label: SPORTS[value].label }));
const DIVISION_CHOICES = DIVISION_ORDER.map((value) => ({ value, label: DIVISION_NAME[value] }));
const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: 'league', label: 'League only', hint: 'Everyone plays everyone, ranked by points' },
  { value: 'knockout', label: 'Knockout only', hint: 'Seeded bracket with placement games' },
  { value: 'league_knockout', label: 'League then knockout', hint: 'The league table seeds the knockout' },
];
const STRUCTURES = [
  { value: 'round_robin' as const, label: 'One table' },
  { value: 'groups' as const, label: 'Two groups (A and B)' },
];

export function BlockForm({
  initial,
  gameCount,
  backHref,
}: {
  initial: BlockFormValues;
  gameCount: number;
  backHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const editing = Boolean(initial.id);
  const locked = gameCount > 0;
  const set = <K extends keyof BlockFormValues>(key: K, value: BlockFormValues[K]) => setV((p) => ({ ...p, [key]: value }));
  const known = isKnownSport(v.sport);
  const defaults = known ? sportSettings(v.sport) : {};
  const num = (text: string) => (text === '' ? undefined : Number(text));

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveSportBlock({
        id: v.id,
        division: v.division,
        sport: v.sport,
        format: v.format,
        leagueStructure: v.format === 'league_knockout' ? v.leagueStructure : null,
        startsOn: v.startsOn || null,
        endsOn: v.endsOn || null,
        settings: {
          gameMinutes: v.settings.gameMinutes,
          ...(v.sport === 'volleyball' ? { maxSets: v.settings.maxSets } : {}),
          ...(v.sport === 'dodgeball' ? { maxRounds: v.settings.maxRounds } : {}),
        },
      });
      if (!result.ok) return setError(result.error);
      router.push(`/sports/manage?division=${v.division}&block=${result.blockId}`);
    });

  const note = lockedNote(gameCount);
  const [formatName, structureName] = formatNote({ format: v.format, league_structure: v.leagueStructure }).split(' · ');

  return (
    <FormFrame
      error={error}
      backHref={backHref}
      submitLabel={editing ? 'Save changes' : 'Create block'}
      pendingLabel="Saving…"
      pending={pending}
      onSubmit={save}
    >
      {note ? <p className="mb-4 text-cis-sm font-bold leading-[1.45] text-cis-ink-muted">{note}</p> : null}

      <FormSection title="What and who">
        {locked ? (
          <>
            <LockedField label="Sport" value={sportLabel(v.sport)} />
            <LockedField label="Division" value={DIVISION_NAME[v.division]} />
          </>
        ) : (
          <>
            <ChoiceGroup name="sport" legend="Sport" choices={SPORT_CHOICES} value={known ? (v.sport as KnownSport) : ''} onChange={(s) => set('sport', s)} />
            <ChoiceGroup name="division" legend="Division" choices={DIVISION_CHOICES} value={v.division} onChange={(d) => set('division', d)} />
          </>
        )}
      </FormSection>

      <FormSection title="How it runs">
        {locked ? (
          <>
            <LockedField label="Format" value={formatName} />
            {v.format !== 'knockout' ? <LockedField label="League structure" value={structureName} /> : null}
          </>
        ) : (
          <>
            <ChoiceGroup
              name="format"
              legend="Format"
              hint={FORMATS.find((f) => f.value === v.format)?.hint}
              choices={FORMATS}
              value={v.format}
              onChange={(f) => set('format', f)}
            />
            {v.format === 'league_knockout' ? (
              <ChoiceGroup
                name="structure"
                legend="League structure"
                hint="Two groups needs at least 6 teams, split into 3 or 4 each."
                choices={STRUCTURES}
                value={v.leagueStructure}
                onChange={(s) => set('leagueStructure', s)}
              />
            ) : null}
          </>
        )}
      </FormSection>

      <FormSection title="When">
        <Field label="Start date" optional>
          {(p) => <TextInput {...p} type="date" value={v.startsOn} onChange={(e) => set('startsOn', e.target.value)} />}
        </Field>
        <Field label="End date" optional>
          {(p) => <TextInput {...p} type="date" value={v.endsOn} onChange={(e) => set('endsOn', e.target.value)} />}
        </Field>
      </FormSection>

      <FormSection title={`${known ? sportLabel(v.sport) : 'Sport'} settings`}>
        <Field label="Game length (minutes)" hint="Used to lay out the schedule.">
          {(p) => (
            <TextInput
              {...p}
              type="number"
              inputMode="numeric"
              min={5}
              max={180}
              placeholder={String(defaults.gameMinutes ?? 20)}
              value={v.settings.gameMinutes ?? ''}
              onChange={(e) => set('settings', { ...v.settings, gameMinutes: num(e.target.value) })}
            />
          )}
        </Field>
        {v.sport === 'volleyball' ? (
          <Field label="Sets per game" hint="Most sets a game can have.">
            {(p) => (
              <TextInput {...p} type="number" inputMode="numeric" min={1} max={9} placeholder="5" value={v.settings.maxSets ?? ''} onChange={(e) => set('settings', { ...v.settings, maxSets: num(e.target.value) })} />
            )}
          </Field>
        ) : null}
        {v.sport === 'dodgeball' ? (
          <Field label="Rounds per game" hint="Most rounds a game can have.">
            {(p) => (
              <TextInput {...p} type="number" inputMode="numeric" min={1} max={15} placeholder="5" value={v.settings.maxRounds ?? ''} onChange={(e) => set('settings', { ...v.settings, maxRounds: num(e.target.value) })} />
            )}
          </Field>
        ) : null}
      </FormSection>
    </FormFrame>
  );
}
