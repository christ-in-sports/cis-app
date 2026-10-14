/**
 * What every Sports page needs, read once per request.
 *
 * `cache` makes the layout and the page share one read of the viewer's roles and
 * one read of the season, instead of each asking.
 */

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { checkAnyRole } from '@/lib/auth/roles';
import { loadSportsData, type SportsData } from '@/lib/competition/read';

/** Admin and Program Team update sports standings (project_spec.md 1.5). */
export const getAccess = cache(() => checkAnyRole(['admin', 'program']));

export const getSportsData = cache(async (): Promise<{ data: SportsData; canScore: boolean }> => {
  const { supabase, userId, hasRole } = await getAccess();
  // The middleware already sends signed-out visitors to the login page; this is
  // the same answer one layer down, so a page never renders with no user.
  if (userId === null) redirect('/login?redirect=/sports');
  return { data: await loadSportsData(supabase, userId), canScore: hasRole };
});

type SearchParams = Record<string, string | string[] | undefined>;

/** A single query-string value, whether Next gives a string or an array. */
export function param(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

/** `/sports/schedule?division=juniors&block=...`, leaving out anything unset. */
export function sportsHref(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
