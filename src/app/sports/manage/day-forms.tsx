'use client';

/**
 * The three Manage forms that act on a block's games: schedule a game day, clear
 * one, and reset the block. Each names what it will do before it does it, and the
 * first two report what happened (how many were placed or cleared, how many are
 * left) in a result strip. Reset is a destructive confirmation: it lists exactly
 * what is deleted and what is kept, and needs a tick before it can be pressed.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { primaryButtonClasses } from '@/components/cis/button';
import { ChoiceGroup, Field, TextInput, TickRow } from '@/components/cis/form';
import { ResultStrip } from '@/components/cis/manage-parts';
import { formatDay, plural } from '@/lib/competition/labels';
import { capacityText, type GameDay } from '@/lib/competition/manage';

import { clearGameDay, resetSportBlock, scheduleGameDay } from '../actions';
import { FormFrame, FormSection } from './form-frame';

const COURTS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }));

export function ScheduleDayForm({
  blockId,
  backHref,
  unscheduled,
  defaultDate,
}: {
  blockId: string;
  backHref: string;
  unscheduled: number;
  defaultDate: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('09:00');
  const [slots, setSlots] = useState('3');
  const [courts, setCourts] = useState('2');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ placed: number; unplaced: number } | null>(null);

  const slotCount = Math.max(0, Math.floor(Number(slots) || 0));

  const submit = () =>
    start(async () => {
      setError(null);
      if (!date) return setError('Pick a date.');
      const result = await scheduleGameDay({ blockId, date, startTime: time, slots: slotCount, courts: Number(courts) });
      if (!result.ok) return setError(result.error);
      setDone({ placed: result.placed, unplaced: result.unplaced });
      router.refresh();
    });

  return (
    <>
      <FormFrame
        error={error}
        backHref={backHref}
        submitLabel="Schedule day"
        pendingLabel="Scheduling…"
        pending={pending && !done}
        disabled={slotCount < 1 || done !== null}
        onSubmit={submit}
      >
        <FormSection title="Game day">
          <Field label="Date">{(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Start time">{(p) => <TextInput {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
          <Field label="Slots" hint="One slot is one game long.">
            {(p) => <TextInput {...p} type="number" inputMode="numeric" min={1} max={24} value={slots} onChange={(e) => setSlots(e.target.value)} />}
          </Field>
          <ChoiceGroup name="courts" legend="Courts" choices={COURTS} value={courts} onChange={setCourts} />
          {slotCount > 0 ? (
            <p className="text-cis-sm font-bold leading-[1.45] text-cis-ink-muted">{capacityText(slotCount, Number(courts), unscheduled)}</p>
          ) : null}
        </FormSection>
        {done ? (
          <div className="mt-4">
            <ResultStrip>
              {plural(done.placed, 'game')} placed{done.unplaced > 0 ? `, ${done.unplaced} left to schedule` : ', none left over'}.
            </ResultStrip>
            <Link href={backHref} className={`${primaryButtonClasses} mt-3 w-full`}>
              Done
            </Link>
          </div>
        ) : null}
      </FormFrame>
    </>
  );
}

export function ClearDayForm({ blockId, backHref, days }: { blockId: string; backHref: string; days: readonly GameDay[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const clearable = days.filter((d) => d.played < d.games);
  const [date, setDate] = useState(clearable[0]?.date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const picked = days.find((d) => d.date === date);
  const toClear = picked ? picked.games - picked.played : 0;

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await clearGameDay({ blockId, date });
      if (!result.ok) return setError(result.error);
      setDone(result.cleared);
      router.refresh();
    });

  return (
    <FormFrame
      error={error}
      backHref={backHref}
      submitLabel="Clear game day"
      pendingLabel="Clearing…"
      pending={pending && done === null}
      disabled={!picked || toClear === 0 || done !== null}
      onSubmit={submit}
    >
      <FormSection title="Which day?">
        <ChoiceGroup
          name="day"
          legend="Game day"
          choices={days.map((d) => ({ value: d.date, label: `${formatDay(d.date)} · ${plural(d.games, 'game')}, ${d.played} played` }))}
          value={date}
          onChange={setDate}
        />
      </FormSection>
      <FormSection title="What happens">
        <p className="text-cis-md font-semibold leading-[1.45]">
          {picked
            ? `${plural(toClear, 'game')} on ${formatDay(picked.date)} go back to unscheduled. Games that already have a result are left alone.`
            : 'Pick a day.'}
        </p>
      </FormSection>
      {done !== null ? (
        <div className="mt-4">
          <ResultStrip>{plural(done, 'game')} cleared.</ResultStrip>
          <Link href={backHref} className={`${primaryButtonClasses} mt-3 w-full`}>
            Done
          </Link>
        </div>
      ) : null}
    </FormFrame>
  );
}

export function ResetForm({
  blockId,
  backHref,
  title,
  deletes,
  keeps,
}: {
  blockId: string;
  backHref: string;
  title: string;
  deletes: readonly { label: string; value: string }[];
  keeps: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await resetSportBlock({ blockId });
      if (!result.ok) return setError(result.error);
      router.push(backHref);
      router.refresh();
    });

  return (
    <FormFrame
      danger
      error={error}
      backHref={backHref}
      submitLabel="Reset block"
      pendingLabel="Resetting…"
      pending={pending}
      disabled={!sure}
      onSubmit={submit}
    >
      <h2 className="pb-3 font-cis-display text-cis-xl font-normal leading-[1.15]">Reset {title}?</h2>
      <div className="h-[5px] rounded-[3px] bg-cis-ink-dark" />
      <div className="py-3.5">
        <div className="text-cis-xs font-bold text-cis-ink-muted">This will be deleted</div>
        <dl className="m-0 mt-1">
          {deletes.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-3 border-b border-cis-rule py-2 text-cis-md">
              <dt className="font-semibold">{d.label}</dt>
              <dd className="m-0 font-extrabold">{d.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="border-t-2 border-dashed border-cis-rule py-3.5">
        <div className="text-cis-xs font-bold text-cis-ink-muted">This is kept</div>
        <p className="mt-1 text-cis-md font-semibold leading-[1.45]">{keeps}</p>
      </div>
      <TickRow checked={sure} onChange={setSure}>
        I understand these results cannot be recovered
      </TickRow>
    </FormFrame>
  );
}
