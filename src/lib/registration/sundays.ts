/**
 * The Sundays of the season, which the parent form lists as tick boxes so a
 * parent can mark the ones their kid will miss.
 *
 * Like the waiver link and the fee, this is program information kept in code:
 * it changes once a season, and a constant is one obvious place to change it.
 * `register_kid()` only checks that each date is a Sunday, so changing these
 * dates needs no migration.
 */

/** First and last Sunday of the season, inclusive (YYYY-MM-DD). */
export const SEASON_FIRST_SUNDAY = '2027-01-03';
export const SEASON_LAST_SUNDAY = '2027-04-18';

/** Every Sunday from the first to the last, as YYYY-MM-DD. */
export function seasonSundays(first = SEASON_FIRST_SUNDAY, last = SEASON_LAST_SUNDAY): string[] {
  const out: string[] = [];
  // UTC throughout, so a daylight-saving change cannot shift a date.
  const end = Date.parse(`${last}T00:00:00Z`);
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= end; t += 7 * 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export const SEASON_SUNDAYS: readonly string[] = seasonSundays();

/** `2027-01-03` -> `Jan 3`. */
export function formatSunday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
