/**
 * `/servant-registration` -- a servant registers for the current season.
 *
 * Open to a servant, because a new servant has no role until an Admin assigns
 * one and this is the only screen they can use. That is someone with no role or
 * one holding Admin, Program, Coach or Prayer; a Parent or Kid account is sent
 * home. It has no bottom nav for the same reason; a user who does hold a role
 * gets a link back to the home page.
 * Every read runs under the servant's own session and every write goes through
 * `submit_servant_registration()`, so RLS stays the boundary.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BoardHeader, BoardShell } from '@/components/cis/board-shell';
import { secondaryButtonClasses } from '@/components/cis/button';
import { Sheet, SheetHeading } from '@/components/cis/sheet';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { loadServantRegistrationContext } from '@/lib/registration/servant';
import ServantClient from './servant-client';

export const dynamic = 'force-dynamic';

export default async function ServantRegistrationPage() {
  const context = await loadServantRegistrationContext();

  if (context.status === 'signed-out') redirect('/login?redirect=/servant-registration');

  // Parents and Kids are not servants, so the form is not for them.
  if (context.status === 'not-servant') redirect('/');

  if (context.status === 'no-season') {
    return (
      <BoardShell>
        <BoardHeader kicker="Servants" title="My registration" />
        <RegistrationColumn>
          <Sheet tone="paper" className="flex flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
            <SheetHeading>Registration is not open</SheetHeading>
            <p className="m-0 text-cis-base leading-[1.5]">
              There is no active season right now. An Admin needs to start the new season first.
              Check back soon.
            </p>
            {context.hasRole && (
              <Link href="/" className={`${secondaryButtonClasses} w-full`}>
                Back to home
              </Link>
            )}
          </Sheet>
        </RegistrationColumn>
      </BoardShell>
    );
  }

  return (
    <ServantClient
      season={context.season}
      email={context.email}
      hasRole={context.hasRole}
      registration={context.registration}
      prefilled={context.prefilled}
    />
  );
}
