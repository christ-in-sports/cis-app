import { redirect } from 'next/navigation';

/** Preserve bookmarked attendance team links and archive/division filters. */
export default async function LegacyTeamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['view', 'division']) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }
  redirect(`/teams${query.size ? `?${query}` : ''}`);
}
