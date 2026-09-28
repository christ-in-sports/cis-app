/**
 * `/register` -- a parent registers their kids for the current season.
 *
 * Parent-only. Like `/admin/imports` this redirects rather than passing a flag
 * down: there is nothing on this screen anyone else may see. RLS remains the
 * real boundary -- every read below runs under the parent's own session, and
 * every write goes through `register_kid()`, which re-checks the role.
 */

import { redirect } from 'next/navigation';

import { PageShell } from '@/components/cis/page-shell';
import { Sheet, SheetHeading } from '@/components/cis/sheet';
import { loadParentRegistrationContext } from '@/lib/registration/parent';
import RegisterClient from './register-client';

export const dynamic = 'force-dynamic';

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PageShell className="max-w-[460px]">
      <h1 className="font-cis-display text-cis-xl font-normal leading-[1.1]">Register a kid</h1>
      <Sheet tone="paper" className="flex flex-col gap-cis-2 px-cis-5 pb-cis-6 pt-cis-6">
        <SheetHeading>{title}</SheetHeading>
        <p className="m-0 text-cis-base leading-[1.5]">{children}</p>
      </Sheet>
    </PageShell>
  );
}

export default async function RegisterPage() {
  const context = await loadParentRegistrationContext();

  if (context.status === 'signed-out') redirect('/login?redirect=/register');

  if (context.status === 'forbidden') {
    return (
      <Notice title="Registration is for parents">
        This page is for parents registering their kids. If that is you and you cannot get in, ask
        an Admin to check your account.
      </Notice>
    );
  }

  if (context.status === 'no-season') {
    return (
      <Notice title="Registration is not open">
        There is no active season right now. Check back once the new season has started.
      </Notice>
    );
  }

  return <RegisterClient season={context.season} kids={context.kids} />;
}
