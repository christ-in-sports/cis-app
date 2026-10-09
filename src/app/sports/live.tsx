'use client';

/**
 * Keeps a Sports screen current without a reload.
 *
 * Supabase Realtime tells the browser when a game, a result or a block changes
 * (the tables are in the `supabase_realtime` publication, and RLS still limits
 * what each viewer is told). Rather than merging each change into local state,
 * the page re-reads from the server a moment after the last change: the data is
 * a few dozen rows, and one source of truth cannot disagree with itself.
 *
 * Realtime can miss changes while a phone is asleep or offline, so the screen also
 * refreshes when the tab comes back and when the connection is re-established.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { createClient } from '@/lib/supabase/client';

const SETTLE_MS = 400;

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscribedBefore = false;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), SETTLE_MS);
    };

    const channel = supabase
      .channel('sports-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sport_blocks' }, refresh)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // A reconnect may have missed changes; the first connection has not.
        if (subscribedBefore) refresh();
        subscribedBefore = true;
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}

/**
 * "Updated 2:41 PM", in the viewer's own time zone.
 *
 * The server does not know the viewer's zone, so formatting there would show
 * server time. `useSyncExternalStore` is the tool for a value that only exists in
 * the browser: the server snapshot is null, so server and browser agree on the
 * first paint and the time appears once the page is live.
 */
const noSubscription = () => () => {};

export function UpdatedAt({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    noSubscription,
    () => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    () => null,
  );

  if (!text) return null;
  return (
    <>
      <div>Updated</div>
      <div>{text}</div>
    </>
  );
}
