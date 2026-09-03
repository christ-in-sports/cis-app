export type Session = 'juniors' | 'ambassadors';
export type AttStatus = 'unmarked' | 'present' | 'absent' | 'late' | 'excused';

export interface MinistryTeam {
  id: string;
  name: string;
  session: Session | null;
  active: boolean;
}

export interface AttendanceGroup {
  id: string;
  name: string;
  session: Session | null;
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

export interface RosterKid {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  session: Session | null;
  team_id: string | null;
}

export const SESSION_LABEL: Record<Session, string> = {
  juniors: 'Juniors (4th–7th)',
  ambassadors: 'Ambassadors (7th–12th)',
};

export const GRADES = ['K','1','2','3','4','5','6','7','8','9','10','11','12'];

export function gradeNum(g: string | null): number | null {
  if (!g) return null;
  const t = g.trim().toLowerCase();
  if (['k','tk','kinder','kindergarten'].includes(t)) return 0;
  const d = t.replace(/\D/g, '');
  return d === '' ? null : parseInt(d, 10);
}

/** Grade 7 returns null — the kid must choose. */
export function defaultSession(g: string | null): Session | null {
  const n = gradeNum(g);
  if (n === null) return null;
  if (n >= 4 && n <= 6) return 'juniors';
  if (n >= 8 && n <= 12) return 'ambassadors';
  return null;
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