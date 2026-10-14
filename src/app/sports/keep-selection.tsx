'use client';

/**
 * Writes the division and sport a page resolved into the address bar, so the nav
 * can carry them to the next page.
 *
 * Sports run back to back (basketball ends, soccer starts), and someone following
 * one sport should not have to choose it again on every screen. A page opened with
 * no `?division=` or `?block=` shows its default (the sport being played now); this
 * adds what it resolved to the URL without a navigation, so Standings -> Schedule ->
 * Bracket stay on that sport. It only fills in what is missing and never overrides
 * a choice already in the URL.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export function KeepSelection({ division, block }: { division: string; block: string | null }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const params = new URLSearchParams(search);
    let changed = false;
    if (!params.get('division')) {
      params.set('division', division);
      changed = true;
    }
    if (block && !params.get('block')) {
      params.set('block', block);
      changed = true;
    }
    if (changed) window.history.replaceState(window.history.state, '', `${pathname}?${params}`);
  }, [pathname, search, division, block]);

  return null;
}
