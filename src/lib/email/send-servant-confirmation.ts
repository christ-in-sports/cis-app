import 'server-only';

import { Resend } from 'resend';

import { buildServantConfirmation, type ServantConfirmationInput } from './servant-confirmation';

export type SendResult =
  | { status: 'sent' }
  /** No `RESEND_API_KEY`: local dev and tests. Nothing was sent, and nothing went wrong. */
  | { status: 'skipped' }
  | { status: 'failed' };

/**
 * Sends the confirmation email through Resend.
 *
 * Never throws: the registration is already saved, so a mail problem must not
 * turn into a failed submit. Logs only the error's code, never the address or
 * form data. Needs `RESEND_API_KEY` and `EMAIL_FROM`; without the key it does
 * nothing.
 */
export async function sendServantConfirmation(
  to: string,
  input: ServantConfirmationInput,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: 'skipped' };

  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error('servant confirmation not sent: EMAIL_FROM is not set');
    return { status: 'failed' };
  }

  try {
    const { subject, text, html } = buildServantConfirmation(input);
    const { error } = await new Resend(apiKey).emails.send({ from, to, subject, text, html });
    if (error) {
      console.error('servant confirmation failed:', error.name);
      return { status: 'failed' };
    }
    return { status: 'sent' };
  } catch {
    console.error('servant confirmation failed: request error');
    return { status: 'failed' };
  }
}
