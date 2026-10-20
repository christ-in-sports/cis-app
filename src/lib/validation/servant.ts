/**
 * The servant registration schema (ENG-17/ENG-18): the season commitment form
 * that replaced the "CIS Servants Commitment" Google Form.
 *
 * Mirrors the CHECK constraints on `servant_registrations`
 * (`supabase/migrations/20261021120000_servant_registrations.sql`); the
 * database is the real boundary, this produces readable per-field errors first.
 *
 * Email is not in the schema. It is the login email, stamped from `auth.users`
 * by `submit_servant_registration()`. Sub-teams are a preference an Admin reads
 * when assigning roles; they never grant a role.
 */

import { z } from 'zod';
import { usPhone } from './phone';

export const EVALUATION_STATUSES = ['completed', 'not_completed'] as const;
export const SERVANT_SESSIONS = ['juniors', 'ambassadors'] as const;
export const SERVANT_SUBTEAMS = ['admin', 'coaches', 'fellowship', 'prayer', 'program'] as const;
export const SERVANT_GENDERS = ['female', 'male'] as const;

export type ServantSession = (typeof SERVANT_SESSIONS)[number];
export type ServantSubteam = (typeof SERVANT_SUBTEAMS)[number];

export const SUBTEAM_LABELS: Record<ServantSubteam, string> = {
  admin: 'Admin Team',
  coaches: 'Coaches',
  fellowship: 'Fellowship Team',
  prayer: 'Prayer Team',
  program: 'Program Team',
};

const requiredText = (label: string) => z.string().trim().min(1, `${label} is required`);

/** Optional free text. A blank is null, matching the nullable column. */
const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().nullable(),
);

export const servantRegistrationSchema = z
  .object({
    full_name: requiredText('Name'),
    evaluation_status: z.enum(EVALUATION_STATUSES, 'Choose Completed or Not Completed'),
    is_serving: z.boolean('Say whether you are serving this season'),

    sessions: z.array(z.enum(SERVANT_SESSIONS)).default([]),
    juniors_subteams: z.array(z.enum(SERVANT_SUBTEAMS)).default([]),
    ambassadors_subteams: z.array(z.enum(SERVANT_SUBTEAMS)).default([]),
    juniors_other: optionalText.default(null),
    ambassadors_other: optionalText.default(null),

    notes: optionalText.default(null),
    dates_missing: optionalText.default(null),

    phone: usPhone('Phone'),
    emergency_contact_name: requiredText('Emergency contact name'),
    emergency_contact_phone: usPhone('Emergency contact phone'),
    gender: z.enum(SERVANT_GENDERS, 'Choose Female or Male'),
    dob: z.iso.date('Date of birth must be a valid date'),
    home_address: requiredText('Home address'),
  })
  .superRefine((value, ctx) => {
    // Session answers only mean something when serving; the database drops them
    // otherwise, so there is nothing to validate.
    if (!value.is_serving) return;

    if (value.sessions.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['sessions'],
        message: 'Choose at least one session',
      });
    }

    for (const session of SERVANT_SESSIONS) {
      if (!value.sessions.includes(session)) continue;
      const teams = value[`${session}_subteams`];
      const other = value[`${session}_other`];
      if (teams.length === 0 && !other) {
        ctx.addIssue({
          code: 'custom',
          path: [`${session}_subteams`],
          message: `Choose at least one team for ${session === 'juniors' ? 'Juniors' : 'Ambassadors'}, or fill in Other`,
        });
      }
    }
  })
  .transform((value) => {
    // Mirror the RPC: not serving discards the session answers; an unchosen
    // session carries none.
    if (!value.is_serving) {
      return {
        ...value,
        sessions: [],
        juniors_subteams: [],
        ambassadors_subteams: [],
        juniors_other: null,
        ambassadors_other: null,
      };
    }
    return {
      ...value,
      juniors_subteams: value.sessions.includes('juniors') ? value.juniors_subteams : [],
      juniors_other: value.sessions.includes('juniors') ? value.juniors_other : null,
      ambassadors_subteams: value.sessions.includes('ambassadors') ? value.ambassadors_subteams : [],
      ambassadors_other: value.sessions.includes('ambassadors') ? value.ambassadors_other : null,
    };
  });

export type ServantRegistrationInput = z.input<typeof servantRegistrationSchema>;
export type ServantRegistration = z.output<typeof servantRegistrationSchema>;
