/**
 * Juniors / Ambassadors. Named `division` to match `registrations.division` and
 * project_spec.md §2.4. Note that `ministry_teams` and `attendance_groups` still
 * spell the same concept `session` in the database -- those columns were not
 * renamed, so their interfaces below keep that name deliberately.
 */
export type Division = 'juniors' | 'ambassadors';
export type AttStatus = 'unmarked' | 'present' | 'absent' | 'late' | 'excused';

export interface MinistryTeam {
  id: string;
  name: string;
  session: Division | null;
  active: boolean;
}

export interface AttendanceGroup {
  id: string;
  name: string;
  session: Division | null;
  grade_min: number | null;
  grade_max: number | null;
  include_ids: string[];
  exclude_ids: string[];
  active: boolean;
}

export interface AttendanceDay {
  id: string;
  group_id: string;
  date: string;
  label: string | null;
  notes: string | null;
  locked: boolean;
}

export interface AttendanceRecord {
  id: string;
  day_id: string;
  registration_id: string;
  status: AttStatus;
  method: string;
  marked_at: string | null;
}

/**
 * A kid as the attendance screens need them: identity from `kids`, flattened
 * together with the season `registrations` row. `id` is the REGISTRATION id,
 * because that is what `attendance_records.registration_id` points at.
 */
export interface RosterKid {
  id: string;
  kid_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  division: Division;
  team_id: string | null;
}

export interface Season {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  is_current: boolean;
}

export interface SummaryRow {
  registration_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  division: Division;
  team_id: string | null;
  team_name: string | null;
  eligible: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  attended: number;
  pct: number;
}

export const DIVISION_LABEL: Record<Division, string> = {
  juniors: 'Juniors (4th–7th)',
  ambassadors: 'Ambassadors (7th–12th)',
};

/**
 * The only grades a kid can register in. Constrained in the database too
 * (`registrations_grade_range`), since registrations also arrive via CSV import
 * and the parent form, not just this UI.
 */
export const REGISTRATION_GRADES = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Parses free-text grade input (forms, CSV cells) into a number. */
export function gradeNum(g: string | null): number | null {
  if (!g) return null;
  const t = g.trim().toLowerCase();
  if (['k', 'tk', 'kinder', 'kindergarten'].includes(t)) return 0;
  const d = t.replace(/\D/g, '');
  return d === '' ? null : parseInt(d, 10);
}

/**
 * The division a grade implies. Grade 7 returns null because it is the one grade
 * that may choose either — the same rule the database enforces with
 * `registrations_division_matches_grade`.
 */
export function defaultDivision(grade: number | null): Division | null {
  if (grade === null) return null;
  if (grade >= 4 && grade <= 6) return 'juniors';
  if (grade >= 8 && grade <= 12) return 'ambassadors';
  return null;
}

/** Whether a grade/division pair satisfies the database CHECK constraint. */
export function divisionAllowedForGrade(grade: number, division: Division): boolean {
  if (grade === 7) return true;
  return defaultDivision(grade) === division;
}

/**
 * Normalises an embedded to-one relation from a PostgREST select.
 *
 * `registrations -> kids` is many-to-one, so PostgREST returns a single object
 * at runtime. The Supabase clients here are not parameterised with the generated
 * `Database` type, though, so the client's inference widens every embed to an
 * array. Indexing `[0]` blindly would therefore break at runtime, and treating
 * it as an object breaks the type-check -- hence handling both.
 *
 * Delete this once `createClient()` / `createServerSupabaseClient()` are typed
 * with `Database`; that change surfaces ~60 further type errors elsewhere in the
 * app, so it belongs in its own PR.
 */
export function embeddedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const STATUS_STYLE: Record<AttStatus, { label: string; cls: string; short: string }> = {
  unmarked: { label: '—',       short: '—', cls: 'bg-muted text-muted-foreground' },
  present:  { label: 'Present', short: 'P', cls: 'bg-green-500/20 text-green-400 border-green-500/50' },
  absent:   { label: 'Absent',  short: 'A', cls: 'bg-red-500/20 text-red-400 border-red-500/50' },
  late:     { label: 'Late',    short: 'L', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/50' },
  excused:  { label: 'Excused', short: 'E', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
};

/** Tap cycles present -> absent -> present. L/E are separate buttons. */
export function nextStatus(s: AttStatus): AttStatus {
  return s === 'present' ? 'absent' : 'present';
}

export function fmtDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Next Sunday, for defaulting the "add day" form. */
export function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}