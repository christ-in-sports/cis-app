/**
 * The confirmation email a servant gets on their first registration of a season.
 *
 * Pure (no network), so it can be tested. It deliberately leaves out the date of
 * birth, home address and emergency contacts: an email sits in an inbox long
 * after the form is closed, and none of those belong there.
 *
 * The HTML uses the shared `emailLayout`, the same look as the Auth emails.
 */

import { SERVANT_SUBTEAMS, SUBTEAM_LABELS, type ServantRegistration } from '@/lib/validation/servant';

import {
  EMAIL_COLORS,
  button,
  dashedBreak,
  details,
  emailLayout,
  escapeHtml,
  heading,
  heavyRule,
  note,
  paragraph,
} from './layout';

export { escapeHtml };

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

export function buildServantConfirmation(input: ServantConfirmationInput): ServantConfirmationEmail {
  const { fullName, seasonName, registration: r, formUrl } = input;

  // Label and value pairs, shared by the plain-text and HTML bodies.
  const items: { label: string; value: string }[] = [
    { label: 'Serving this season', value: r.is_serving ? 'Yes' : 'No, not serving a session' },
  ];
  if (r.is_serving) {
    for (const session of r.sessions) {
      if (session === 'no_preference') {
        items.push({ label: 'Session', value: 'No preference' });
        items.push({ label: 'Teams', value: teamsFor(r.juniors_subteams, r.juniors_other) });
        continue;
      }
      items.push({
        label: SESSION_LABELS[session],
        value: teamsFor(
          session === 'juniors' ? r.juniors_subteams : r.ambassadors_subteams,
          session === 'juniors' ? r.juniors_other : r.ambassadors_other,
        ),
      });
    }
  }
  if (r.dates_missing) items.push({ label: 'Dates you will miss', value: r.dates_missing });

  const intro = `Hi ${fullName}, we have your servant registration for ${seasonName}.`;
  const review = 'An Admin will review your registration and confirm your role.';
  const outro = 'Your team choices are preferences. You can change your answers at any time:';

  const text = [
    intro,
    '',
    ...items.map(({ label, value }) => `${label}: ${value}`),
    '',
    review,
    outro,
    formUrl,
  ].join('\n');

  const href = escapeHtml(formUrl);
  const html = emailLayout({
    title: `Servant registration received: ${escapeHtml(seasonName)}`,
    preheader: escapeHtml(`We have your registration for ${seasonName}.`),
    logoUrl: `${escapeHtml(new URL(formUrl).origin)}/assets/fish-mark.png`,
    body: [
      heading('You are registered'),
      heavyRule(),
      paragraph(escapeHtml(intro), { first: true }),
      details(items.map(({ label, value }) => ({ label: escapeHtml(label), value: escapeHtml(value) }))),
      dashedBreak(),
      paragraph(escapeHtml(review), { bold: true, first: true }),
      paragraph(escapeHtml(outro.replace(/:$/, '.'))),
      button(href, 'Edit my answers'),
      note(`Or open this link: <a href="${href}" style="color: ${EMAIL_COLORS.action};">${href}</a>`),
    ],
  });

  return { subject: `Servant registration received: ${seasonName}`, text, html };
}
