/**
 * `/join?code=...` -- how a parent gets in. One link, posted in the parent group
 * chat, like the Google Form it replaces (ENG-31, `docs/arch_decisions.md`
 * 2026-10-25).
 *
 * A wrong or missing code shows only a notice. A valid one shows the join form,
 * or, for someone already signed in, one button that adds Parent to their
 * account (a servant who is also a parent); someone who already is a Parent goes
 * straight to registration. The page is outside the `(app)` shell so a roleless
 * visitor is not sent to the servant form. Every step re-checks the code on the
 * server (`actions.ts`).
 */

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { checkParentJoinCode } from '@/lib/auth/join-code';
import { checkRole } from '@/lib/auth/roles';
import JoinClient, { JoinSignedIn } from './join-client';

export const dynamic = 'force-dynamic';

// The link carries the join code: keep it out of search results and Referer headers.
export const metadata: Metadata = {
  title: 'Join Christ in Sports',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function JoinFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 safe-top safe-bottom">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <Image
              src="/icons/icon-192.png"
              alt="CIS logo"
              width={150}
              height={150}
              priority
              className="rounded-2xl"
            />
          </div>
          <CardTitle className="font-cis-display text-2xl font-normal leading-[1.1]">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).code;
  const code = typeof raw === 'string' ? raw.trim() : undefined;
  const check = checkParentJoinCode(code);

  if (check !== 'ok' || !code) {
    return (
      <JoinFrame
        title="This link has changed"
        description={
          check === 'unconfigured'
            ? 'Joining is not available right now. Please ask an Admin for help.'
            : 'Use the latest link from the parent group chat.'
        }
      >
        <Link href="/login" className={buttonVariants({ variant: 'outline', className: 'w-full h-12 text-base' })}>
          Already have an account? Sign in
        </Link>
      </JoinFrame>
    );
  }

  const { supabase, userId, hasRole } = await checkRole('parent');
  if (userId && hasRole) redirect('/register');

  if (userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return (
      <JoinFrame title="Join Christ in Sports" description="Register your kids for the season">
        <JoinSignedIn code={code} email={user?.email ?? 'your account'} />
      </JoinFrame>
    );
  }

  return (
    <JoinFrame title="Join Christ in Sports" description="Register your kids for the season">
      <JoinClient code={code} />
    </JoinFrame>
  );
}
