'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Field, FieldError, TextInput } from '@/components/cis/form';
import { PrimaryButton, SecondaryButton } from '@/components/cis/button';
import { nextSunday } from '@/lib/attendance';
import { archiveAttendance, createSession } from './actions';

export default function AttendanceClient({ hasDays }: { hasDays: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return <>
    <div className="flex flex-wrap gap-3">
      <PrimaryButton disabled={pending} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Cancel' : 'Create attendance day'}</PrimaryButton>
      {hasDays && <SecondaryButton disabled={pending} onClick={() => {
        if (!window.confirm('Archive current attendance and teams? Saved marks, team rosters and coach assignments stay available in Archive. Kids will be unassigned so you can create new teams.')) return;
        setError('');
        start(async () => {
          const result = await archiveAttendance();
          if (!result.ok) setError(result.error);
          else { router.push('/attendance/archive'); router.refresh(); }
        });
      }}>{pending ? 'Saving…' : 'Archive current attendance'}</SecondaryButton>}
    </div>
    {open && <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setError('');
      start(async () => {
        const result = await createSession({ date: form.get('date') });
        if (!result.ok) setError(result.error);
        else router.push(`/attendance/${result.id}`);
      });
    }}>
      <Field label="Date">{(props) => <TextInput {...props} name="date" type="date" defaultValue={nextSunday()} required />}</Field>
      <PrimaryButton type="submit" disabled={pending} block>{pending ? 'Creating…' : 'Create day'}</PrimaryButton>
    </form>}
    {error && <FieldError>{error}</FieldError>}
  </>;
}
