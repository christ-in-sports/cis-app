'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Field, FieldError, SelectInput, TextInput } from '@/components/cis/form';
import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { nextSunday } from '@/lib/attendance';
import { createSession } from './actions';

export default function AttendanceClient({ seasonId }: { seasonId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return <>
    <SecondaryButton onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Cancel' : 'Create session'}</SecondaryButton>
    {open && <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setError('');
      start(async () => {
        const result = await createSession({ seasonId, title: form.get('title'), date: form.get('date'), division: form.get('division') || null });
        if (!result.ok) setError(result.error);
        else router.push(`/attendance/${result.id}`);
      });
    }}>
      <Field label="Session title">{(props) => <TextInput {...props} name="title" placeholder="Sunday practice" maxLength={100} required />}</Field>
      <Field label="Date">{(props) => <TextInput {...props} name="date" type="date" defaultValue={nextSunday()} required />}</Field>
      <Field label="Who is attending?" hint="The roster uses active registrations in this season, grouped by team.">{(props) => <SelectInput {...props} name="division">
        <option value="">Both divisions</option><option value="juniors">Juniors</option><option value="ambassadors">Ambassadors</option>
      </SelectInput>}</Field>
      {error && <FieldError>{error}</FieldError>}
      <PrimaryButton type="submit" disabled={pending} block>{pending ? 'Creating…' : 'Create attendance'}</PrimaryButton>
    </form>}
  </>;
}
