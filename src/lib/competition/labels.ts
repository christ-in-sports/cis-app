/**
 * Words and dates for the Sports screens.
 *
 * Dates and clock times come from the database as plain `YYYY-MM-DD` and
 * `HH:MM:SS` with no time zone (a game is at 9:00 wherever you read it), so they
 * are formatted from their parts and never through `new Date(...)` in the local
 * zone, which would shift a date across midnight for some viewers.
 */

import { isKnownSport, SPORTS, sportColumns } from './scores';

export const DIVISION_ORDER = ['juniors', 'ambassadors'] as const;

export const DIVISION_NAME = { juniors: 'Juniors', ambassadors: 'Ambassadors' } as const;

export const DIVISION_AGES = { juniors: 'Ages 10–13', ambassadors: 'Ages 14–18' } as const;

export function sportLabel(sport: string): string {
  return isKnownSport(sport) ? SPORTS[sport].label : sport.charAt(0).toUpperCase() + sport.slice(1);
}

/** What decides a level knockout game, by sport, for "Warriors won on penalties". */
const TIEBREAK_PHRASE: Record<string, string> = {
  soccer: 'on penalties',
  basketball: 'in overtime',
  dodgeball: 'in the extra round',
  volleyball: 'in a deciding set',
};

export function tiebreakPhrase(sport: string): string {
  return TIEBREAK_PHRASE[sport] ?? 'in the tiebreak';
}

/** 1 -> "1st", 12 -> "12th", 23 -> "23rd". */
export function ordinal(n: number): string {
  const { value, suffix } = ordinalParts(n);
  return `${value}${suffix}`;
}

export function ordinalParts(n: number): { value: number; suffix: string } {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return { value: n, suffix: 'th' };
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return { value: n, suffix };
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateParts(iso: string): { weekday: string; month: string; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  // UTC on purpose: the date is a calendar date, not an instant.
  const date = new Date(Date.UTC(y, m - 1, d));
  return { weekday: WEEKDAYS[date.getUTCDay()], month: MONTHS[m - 1], day: d };
}

/** "Saturday, Oct 12". */
export function formatDay(iso: string): string {
  const { weekday, month, day } = dateParts(iso);
  return `${weekday}, ${month} ${day}`;
}

/** "Oct 12". */
export function formatShortDate(iso: string): string {
  const { month, day } = dateParts(iso);
  return `${month} ${day}`;
}

/** "9:45" from "09:45:00" -- the schedule table has no AM/PM, the day gives the context. */
export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')}`;
}

/** "9:45 AM" from "09:45:00". */
export function formatClockMeridiem(time: string): string {
  const [h] = time.split(':').map(Number);
  return `${formatClock(time)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Oct 19 · 9:00 · Court 1", leaving out whatever is not set. */
export function scheduleText(game: {
  scheduled_date: string | null;
  scheduled_time: string | null;
  court: number | null;
}): string | null {
  if (!game.scheduled_date) return null;
  const parts = [formatShortDate(game.scheduled_date)];
  if (game.scheduled_time) parts.push(formatClock(game.scheduled_time));
  if (game.court) parts.push(`Court ${game.court}`);
  return parts.join(' · ');
}

/** "+7", "−1" (a real minus sign, which lines up with the plus), or "0". */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

/** "Juniors soccer": a block's name on screen. */
export function blockTitle(division: keyof typeof DIVISION_NAME, sport: string): string {
  return `${DIVISION_NAME[division]} ${sportLabel(sport).toLowerCase()}`;
}

const COLUMN_WORDS: Record<string, { difference: string; scored: string }> = {
  soccer: { difference: 'goal difference', scored: 'goals scored' },
  basketball: { difference: 'point difference', scored: 'points scored' },
  volleyball: { difference: 'set difference', scored: 'sets won' },
  dodgeball: { difference: 'round difference', scored: 'rounds won' },
};

/**
 * The footnote under a league table, which spells out the abbreviations and says
 * how rank is set: "GD goal difference · GF goals scored · 3 points for a win,
 * 1 for a draw. Rank is set by points, then head-to-head between tied teams,
 * then GD; it does not move when you sort."
 */
export function standingsNote(sport: string): string {
  const { difference, scored } = sportColumns(sport);
  const words = COLUMN_WORDS[sport] ?? { difference: 'difference', scored: 'scored' };
  return (
    `${difference} ${words.difference} · ${scored} ${words.scored} · 3 points for a win, 1 for a draw. ` +
    `Rank is set by points, then head-to-head between tied teams, then ${difference}; it does not move when you sort.`
  );
}
