/**
 * `/` -- Today: where the app opens. It leads with the next game (the viewer's
 * own team's when they have one), then a shortcut to each job the viewer's roles
 * give them. Rows carry a domain tile: orange for the game, slate for people.
 *
 * Every shortcut leads somewhere the role may go (`project_spec.md` §1.5); each
 * screen still checks access itself and RLS is the boundary.
 */

import Image from 'next/image';
import { redirect } from 'next/navigation';

import { BoardHeader } from '@/components/cis/board-shell';
import { MenuRow, MenuSheet } from '@/components/cis/menu-list';
import { NextGameCard } from '@/components/cis/next-game-card';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { getMyRoles } from '@/lib/auth/roles';
import { nextGame } from '@/lib/competition/next-game';
import { loadSportsData } from '@/lib/competition/read';
import { SERVANT_REGISTRATION_PATH } from '@/lib/auth/servant-gate';

export default async function TodayPage() {
  const { supabase, userId, roles } = await getMyRoles();
  if (!userId) redirect('/login');

  // A new servant has no role yet; the registration form is all they can use.
  if (roles.size === 0) redirect(SERVANT_REGISTRATION_PATH);

  const now = new Date();
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(now);
  // `YYYY-MM-DD` in the program's time zone, to compare with game dates.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now);

  // Today must open even if the sports read fails, so a failure only hides the card.
  const sports = await loadSportsData(supabase, userId).catch(() => null);
  const next = sports ? nextGame(sports, today) : null;
  const isAdmin = (roles.has('director') || roles.has('admin'));
  const manages = isAdmin || roles.has('program');

  return (
    <>
      <BoardHeader
        kicker={date}
        title="Today"
        action={
          // The logo at its smallest allowed width (DESIGN_SYSTEM.md §9), on the page ground.
          <Image src="/icons/icon-192.png" alt="Christ in Sports" width={120} height={71} priority />
        }
      />
      <RegistrationColumn>
        {next && (
          <NextGameCard
            next={next}
            today={today}
            scheduleHref={`/sports/schedule?division=${next.block.division}&block=${next.block.id}`}
          />
        )}
        {manages && (
          <MenuSheet heading="Run the day">
            <MenuRow href="/attendance" title="Attendance days" icon="attendance" />
            <MenuRow href="/sports/schedule" title="Games and scores" icon="schedule" domain="sport" />
            <MenuRow href="/teams" title="Teams" icon="roster" />
            <MenuRow href="/sports/manage" title="Manage sports" icon="manage" domain="sport" />
            {roles.has('director') && <MenuRow href="/servants" title="Servant registrations" icon="servants" />}
          </MenuSheet>
        )}
        {roles.has('coach') && (
          <MenuSheet heading="Your team">
            <MenuRow href="/attendance" title="Take attendance" icon="attendance" />
            <MenuRow href="/sports/schedule" title="Your games" icon="schedule" domain="sport" />
          </MenuSheet>
        )}
        {roles.has('parent') && (
          <MenuSheet heading="Your kids">
            <MenuRow href="/register" title="Registration" icon="register" />
          </MenuSheet>
        )}
        <MenuSheet heading="The season">
          <MenuRow href="/sports" title="Standings" icon="standings" domain="sport" />
          <MenuRow href="/sports/schedule" title="Schedule" icon="schedule" domain="sport" />
          <MenuRow href="/sports/bracket" title="Bracket" icon="bracket" domain="sport" />
        </MenuSheet>
      </RegistrationColumn>
    </>
  );
}
