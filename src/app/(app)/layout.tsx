import { Suspense, type ReactNode } from 'react';

import { AppNav } from '@/components/cis/app-nav';
import { BoardShell } from '@/components/cis/board-shell';

import { ViewerAppNav } from './viewer-app-nav';

/**
 * The app shell every signed-in screen shares: the board behind it and the one
 * bottom bar (`AppNav`) under it. Sections add their own `SectionTabs` in their
 * layouts. A layout rather than something each page renders, so the board and
 * the bar stay on screen while a page loads and when moving between sections.
 * The route group's parentheses mean the URLs are unchanged.
 *
 * Sign-in, sign-up and the servant registration form sit outside it on purpose:
 * a roleless servant has nothing else to reach, so that form has no bar.
 *
 * The layout waits for nothing, so the board paints immediately. Until the
 * viewer's roles are known the bar shows the items everyone has; the rest
 * stream in with `ViewerAppNav`.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <BoardShell>
      {children}
      <Suspense fallback={<AppNav roles={[]} />}>
        <ViewerAppNav />
      </Suspense>
    </BoardShell>
  );
}
