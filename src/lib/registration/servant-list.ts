/**
 * What the Admin servants list shows of a registration, and how it becomes a
 * CSV. Client-safe: no database access here, so the table and its tests can use it.
 */

import Papa from 'papaparse';

import {
  SERVANT_SESSIONS,
  SERVANT_SUBTEAMS,
  SUBTEAM_LABELS,
  type ServantSession,
  type ServantSubteam,
} from '@/lib/validation/servant';

export interface ServantListRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  evaluation_status: 'completed' | 'not_completed';
  is_serving: boolean;
  sessions: ServantSession[];
  juniors_subteams: ServantSubteam[];
  ambassadors_subteams: ServantSubteam[];
  juniors_other: string | null;
  ambassadors_other: string | null;
  notes: string | null;
  dates_missing: string | null;
  gender: 'female' | 'male';
  dob: string;
  home_address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  created_at: string;
  updated_at: string;
}

export const SESSION_LABELS: Record<ServantSession, string> = {
  juniors: 'Juniors',
  ambassadors: 'Ambassadors',
};

export const EVALUATION_LABELS = { completed: 'Completed', not_completed: 'Not Completed' } as const;
export const GENDER_LABELS = { female: 'Female', male: 'Male' } as const;

/** The teams a servant chose for one session, as readable text ("Coaches, Prayer Team, Other: x"). */
export function sessionTeams(row: ServantListRow, session: ServantSession): string {
  const teams = row[`${session}_subteams`];
  const other = row[`${session}_other`];
  const labels = SERVANT_SUBTEAMS.filter((t) => teams.includes(t)).map((t) => SUBTEAM_LABELS[t]);
  if (other) labels.push(`Other: ${other}`);
  return labels.join(', ');
}

/** Sessions the servant chose, in a fixed order. */
export const chosenSessions = (row: ServantListRow): ServantSession[] =>
  SERVANT_SESSIONS.filter((s) => row.sessions.includes(s));

export const SERVANT_CSV_COLUMNS = [
  'full_name',
  'email',
  'phone',
  'evaluation_status',
  'is_serving',
  'sessions',
  'juniors_teams',
  'ambassadors_teams',
  'notes',
  'dates_missing',
  'gender',
  'dob',
  'home_address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'updated_at',
] as const;

/**
 * Spreadsheets read a cell that starts with = + - or @ as a formula. These cells
 * hold what servants typed, so a leading apostrophe stops one running when an
 * Admin opens the file.
 */
function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One row per servant, with the same fields the expanded row shows. */
export function servantsToCsv(rows: readonly ServantListRow[]): string {
  return Papa.unparse({
    fields: [...SERVANT_CSV_COLUMNS],
    data: rows.map((r) =>
      [
        r.full_name,
        r.email,
        r.phone,
        EVALUATION_LABELS[r.evaluation_status],
        r.is_serving ? 'Yes' : 'No',
        chosenSessions(r).map((s) => SESSION_LABELS[s]).join(', '),
        r.sessions.includes('juniors') ? sessionTeams(r, 'juniors') : '',
        r.sessions.includes('ambassadors') ? sessionTeams(r, 'ambassadors') : '',
        r.notes ?? '',
        r.dates_missing ?? '',
        GENDER_LABELS[r.gender],
        r.dob,
        r.home_address,
        r.emergency_contact_name,
        r.emergency_contact_phone,
        r.updated_at,
      ].map(safeCell),
    ),
  });
}
