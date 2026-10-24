import type { ReactNode } from 'react';

import { SportsNav } from '@/components/cis/sports-nav';

import { redirectIfRoleless } from '@/lib/auth/servant-gate';

import { getAccess } from './data';
import { LiveRefresh } from './live';

/**
 * What every Sports screen shares inside the app shell: the section tabs above
 * it and the live refresh. "Manage" joins the tabs for Admin and Program Team
 * only; the Manage pages check the role again, and RLS is the boundary.
 */
export default async function SportsLayout({ children }: { children: ReactNode }) {
  await redirectIfRoleless();
  const { hasRole } = await getAccess();
  return (
    <>
      <LiveRefresh />
      <SportsNav canManage={hasRole} />
      {children}
    </>
  );
}
