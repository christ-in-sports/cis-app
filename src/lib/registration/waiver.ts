/**
 * The liability waiver a parent agrees to when registering.
 *
 * PLACEHOLDER. The program has not supplied its waiver wording, and this is a
 * legal document about minors, so it is not something to invent. Replace both
 * constants with the church's approved text before this ships (ENG-4 PR notes
 * flag it). Consent is stored as a timestamp only -- `consent_given_at` -- so if
 * the wording ever changes, consider versioning it alongside that column.
 */

export const WAIVER_TITLE = 'Liability waiver';

export const WAIVER_TEXT =
  'The liability waiver text from the program goes here. Parents must read and agree to it before a registration is complete.';
