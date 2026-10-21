import type { ReactNode } from 'react';

import { BoardShell } from '@/components/cis/board-shell';
import { SportsNav } from '@/components/cis/sports-nav';

import { redirectIfRoleless } from '@/lib/auth/servant-gate';

import { getAccess } from './data';
import { LiveRefresh } from './live';

/**
 * The frame every Sports screen shares: the board behind it, the in-section nav
 * under it, and the live refresh. "Manage" joins the nav for Admin and Program
 * Team only; the Manage pages check the role again, and RLS is the boundary.
 */
export default async function SportsLayout({ children }: { children: ReactNode }) {
  await redirectIfRoleless();
  const { hasRole } = await getAccess();
  return (
    <BoardShell>
      <LiveRefresh />
      {children}
      <SportsNav canManage={hasRole} />
    </BoardShell>
  );
}
