import { Suspense, type ReactNode } from 'react';

import { RegistrationFrame } from '@/components/cis/registration-frame';
import { RegistrationNav } from '@/components/cis/registration-nav';

import { ViewerNav } from './viewer-nav';

/**
 * The frame every Registration screen shares (parent form, roster, CSV import):
 * the board behind it and the Registration nav under it. A layout rather than
 * something each page renders, so both stay on screen while a page loads. The
 * route group's parentheses mean the URLs are unchanged.
 *
 * The layout itself waits for nothing, so the board paints immediately. Until the
 * viewer's roles are known the nav shows the two tabs everyone has (Home and
 * Sports); the rest arrive with `ViewerNav`.
 */
export default function RegistrationLayout({ children }: { children: ReactNode }) {
  return (
    <RegistrationFrame
      nav={
        <Suspense
          fallback={<RegistrationNav isParent={false} isStaff={false} isAdmin={false} />}
        >
          <ViewerNav />
        </Suspense>
      }
    >
      {children}
    </RegistrationFrame>
  );
}
