/**
 * The confirmation email a servant gets on their first registration of a season.
 *
 * Pure (no network), so it can be tested. It deliberately leaves out the date of
 * birth, home address and emergency contacts: an email sits in an inbox long
 * after the form is closed, and none of those belong there.
 */

import { SERVANT_SUBTEAMS, SUBTEAM_LABELS, type ServantRegistration } from '@/lib/validation/servant';

export interface ServantConfirmationInput {
  fullName: string;
  seasonName: string;
  registration: Pick<
    ServantRegistration,
    | 'is_serving'
    | 'sessions'
    | 'juniors_subteams'
    | 'ambassadors_subteams'
    | 'juniors_other'
    | 'ambassadors_other'
    | 'dates_missing'
  >;
  /** Absolute URL of the form, so the servant can edit their answers. */
  formUrl: string;
}

export interface ServantConfirmationEmail {
  subject: string;
  text: string;
  html: string;
}

const SESSION_LABELS = { juniors: 'Juniors', ambassadors: 'Ambassadors' } as const;

function teamsFor(
  teams: readonly string[],
  other: string | null,
): string {
  const labels = SERVANT_SUBTEAMS.filter((t) => teams.includes(t)).map((t) => SUBTEAM_LABELS[t]);
  if (other) labels.push(`Other: ${other}`);
  return labels.join(', ');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildServantConfirmation(input: ServantConfirmationInput): ServantConfirmationEmail {
  const { fullName, seasonName, registration: r, formUrl } = input;

  const lines: string[] = [];
  if (r.is_serving) {
    lines.push('You are serving this season.');
    for (const session of r.sessions) {
      const teams = teamsFor(
        session === 'juniors' ? r.juniors_subteams : r.ambassadors_subteams,
        session === 'juniors' ? r.juniors_other : r.ambassadors_other,
      );
      lines.push(`${SESSION_LABELS[session]}: ${teams}`);
    }
  } else {
    lines.push('You are not serving a session this season.');
  }
  if (r.dates_missing) lines.push(`Dates you will miss: ${r.dates_missing}`);

  const intro = `Hi ${fullName}, we have your servant registration for ${seasonName}.`;
  const outro =
    'Your team choices are preferences. An Admin will confirm your role. ' +
    'You can change your answers at any time:';

  const text = [intro, '', ...lines, '', outro, formUrl].join('\n');
  const html =
    `<p>${escapeHtml(intro)}</p>` +
    `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` +
    `<p>${escapeHtml(outro)} <a href="${escapeHtml(formUrl)}">${escapeHtml(formUrl)}</a></p>`;

  return { subject: `Servant registration received: ${seasonName}`, text, html };
}
