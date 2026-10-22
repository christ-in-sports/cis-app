/**
 * The parts of servant registration that the form (a client component) shares
 * with the server loader. Kept apart from `servant.ts`, which reads the database
 * and must never be bundled for the browser.
 */

import type {
  EVALUATION_STATUSES,
  SERVANT_GENDERS,
  ServantSession,
  ServantSubteam,
} from '@/lib/validation/servant';

/** The static intro shown above the form (ENG-17: not editable in the app). */
export const SERVANT_INTRO = {
  meeting: 'All servants attend the 12:00 meeting on Sundays, including those not serving a session this season.',
  sessions: 'Sessions run on Sundays.',
} as const;

export interface ServantSeason {
  id: string;
  name: string;
  starts_on: string;
}

/** A saved registration, as the form reads it back (email is not part of the form). */
export interface ServantRegistrationRecord {
  full_name: string;
  evaluation_status: (typeof EVALUATION_STATUSES)[number];
  is_serving: boolean;
  sessions: ServantSession[];
  juniors_subteams: ServantSubteam[];
  ambassadors_subteams: ServantSubteam[];
  juniors_other: string | null;
  ambassadors_other: string | null;
  notes: string | null;
  dates_missing: string | null;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  gender: (typeof SERVANT_GENDERS)[number];
  dob: string;
  home_address: string;
  updated_at: string;
}
