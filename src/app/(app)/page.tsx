/**
 * `/` -- Today: where the app opens, with a shortcut to each job the viewer's
 * roles give them. For now these are links to the existing screens; the live
 * counts (teams not yet marked, games waiting for a score) come later.
 *
 * Every shortcut leads somewhere the role may go (`project_spec.md` §1.5); each
 * screen still checks access itself and RLS is the boundary.
 */

import { redirect } from 'next/navigation';

import { BoardHeader } from '@/components/cis/board-shell';
import { MenuRow, MenuSheet } from '@/components/cis/menu-list';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { getMyRoles } from '@/lib/auth/roles';
import { SERVANT_REGISTRATION_PATH } from '@/lib/auth/servant-gate';

export default async function TodayPage() {
  const { supabase, userId, roles } = await getMyRoles();
  if (!userId) redirect('/login');

  // A new servant has no role yet; the registration form is all they can use.
  if (roles.size === 0) redirect(SERVANT_REGISTRATION_PATH);

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();

  const name = profile?.display_name?.trim().split(/\s+/)[0];
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(new Date());
  const isAdmin = roles.has('admin');
  const manages = isAdmin || roles.has('program');

  return (
    <>
      <BoardHeader kicker={date} title="Today" meta={name ? `Hi, ${name}` : undefined} />
      <RegistrationColumn>
        {manages && (
          <MenuSheet heading="Run the day">
            <MenuRow href="/attendance" title="Attendance days" note="Create today's day and see which teams are marked" />
            <MenuRow href="/sports/schedule" title="Games and scores" note="Today's schedule, with results to enter" />
            <MenuRow href="/teams" title="Teams" note="Create teams and assign coaches and registered kids" />
            <MenuRow href="/sports/manage" title="Manage sports" note="Blocks, fixtures and game days" />
            {isAdmin && <MenuRow href="/servants" title="Servant registrations" note="Who has signed up this season" />}
          </MenuSheet>
        )}
        {roles.has('coach') && (
          <MenuSheet heading="Your team">
            <MenuRow href="/attendance" title="Take attendance" note="Open today's day and mark your team, or scan QR cards" />
            <MenuRow href="/sports/schedule" title="Your games" note="Today's schedule and courts" />
          </MenuSheet>
        )}
        {roles.has('parent') && (
          <MenuSheet heading="Your kids">
            <MenuRow href="/register" title="Registration" note="Register a kid or finish one in progress" />
          </MenuSheet>
        )}
        <MenuSheet heading="The season">
          <MenuRow href="/sports" title="Standings" />
          <MenuRow href="/sports/schedule" title="Schedule" />
          <MenuRow href="/sports/bracket" title="Bracket" />
        </MenuSheet>
      </RegistrationColumn>
    </>
  );
}
