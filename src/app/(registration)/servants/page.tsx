/**
 * `/servants` -- the current season's servant registrations.
 *
 * Admin-only. A registration holds a DOB, a home address and emergency contacts,
 * so only an Admin reads other servants' rows. RLS is the boundary
 * (`servant_registrations` is readable by its owner and by `has_role('admin')`);
 * this redirect only spares anyone else an empty screen.
 */

import { redirect } from 'next/navigation';

import { BoardHeader } from '@/components/cis/board-shell';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { Sheet, SheetHeading } from '@/components/cis/sheet';
import { checkAdmin } from '@/lib/auth/admin';
import type { ServantListRow } from '@/lib/registration/servant-list';
import ServantsClient from './servants-client';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'id, full_name, email, phone, evaluation_status, is_serving, sessions, juniors_subteams, ' +
  'ambassadors_subteams, juniors_other, ambassadors_other, notes, dates_missing, gender, dob, ' +
  'home_address, emergency_contact_name, emergency_contact_phone, created_at, updated_at';

export default async function ServantsPage() {
  const { supabase, userId, isAdmin } = await checkAdmin();

  if (userId === null) redirect('/login?redirect=/servants');
  if (!isAdmin) redirect('/');

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .maybeSingle();

  if (!season) {
    return (
      <>
        <BoardHeader kicker="Admin" title="Servants" />
        <RegistrationColumn>
          <Sheet tone="paper" className="flex flex-col gap-cis-2 px-cis-5 pb-cis-6 pt-cis-6">
            <SheetHeading>No active season</SheetHeading>
            <p className="m-0 text-cis-base leading-[1.5]">
              Servants register for the current season, and there is not one right now. Start the
              new season first.
            </p>
          </Sheet>
        </RegistrationColumn>
      </>
    );
  }

  const { data, error } = await supabase
    .from('servant_registrations')
    .select(COLUMNS)
    .eq('season_id', season.id)
    .order('full_name');

  if (error) {
    // Never log row data: it holds DOBs, addresses and emergency contacts.
    console.error('loading servant registrations failed:', error.code);
  }

  return (
    <ServantsClient
      seasonName={season.name}
      rows={(data ?? []) as unknown as ServantListRow[]}
      loadFailed={Boolean(error)}
    />
  );
}
