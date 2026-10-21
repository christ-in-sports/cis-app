'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Poll fresh, RLS-filtered server data, including on return to the app. Works
 * without requiring a Realtime publication on the hosted database. */
export function LiveAttendance() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [router]);
  return null;
}
