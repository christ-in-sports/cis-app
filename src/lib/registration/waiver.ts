/**
 * The liability waiver a parent agrees to when registering.
 *
 * It is a document the program keeps in Google Drive, so the form links to it
 * rather than reproducing the text: the church can update the document without
 * a code change, and there is no second copy to fall out of date. The catch is
 * that the link is the only record of what was agreed to -- consent is stored
 * as a timestamp (`consent_given_at`) and nothing else, so if the document is
 * ever materially rewritten, consider recording which version was in force.
 */

export const WAIVER_TITLE = 'Liability waiver';

export const WAIVER_URL =
  'https://drive.google.com/file/d/0Byk-ppNbBTlHNGxsbHNGdVRXZnM/edit?usp=sharing';
