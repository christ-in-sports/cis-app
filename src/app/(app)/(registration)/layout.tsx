import { Suspense, type ReactNode } from 'react';

import { ViewerNav } from './viewer-nav';

/**
 * What every Registration screen (parent form, roster, servants, CSV import,
 * roles) shares inside the app shell: the section tabs above it. The route
 * group's parentheses mean the URLs are unchanged.
 *
 * The tabs depend on the viewer's roles, so they stream in with `ViewerNav`
 * while the page itself renders.
 */
export default function RegistrationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ViewerNav />
      </Suspense>
      {children}
    </>
  );
}
