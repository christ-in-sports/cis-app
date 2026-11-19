/**
 * The liability waiver a parent agrees to when registering.
 *
 * It is a Google Form the program keeps, so the registration form links to it
 * rather than reproducing the text: the church can update it without a code
 * change, and there is no second copy to fall out of date. The catch is
 * that the link is the only record of what was agreed to -- consent is stored
 * as a timestamp (`consent_given_at`) and nothing else, so if the document is
 * ever materially rewritten, consider recording which version was in force.
 */

export const WAIVER_TITLE = 'Liability waiver';

export const WAIVER_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdhIp-Vtg7OyeDLQgdEG9hLzYz2OsWhop6aYySSEX6X7QMTHw/viewform';
