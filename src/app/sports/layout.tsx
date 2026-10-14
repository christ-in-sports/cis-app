import type { ReactNode } from 'react';

import { BoardShell } from '@/components/cis/board-shell';
import { SportsNav } from '@/components/cis/sports-nav';

import { LiveRefresh } from './live';

/**
 * The frame every Sports screen shares: the board behind it, the in-section nav
 * under it, and the live refresh. "Manage" joins the nav for Admin and Program
 * Team once that screen exists (the next change), so it is not offered yet.
 */
export default function SportsLayout({ children }: { children: ReactNode }) {
  return (
    <BoardShell>
      <LiveRefresh />
      {children}
      <SportsNav canManage={false} />
    </BoardShell>
  );
}
