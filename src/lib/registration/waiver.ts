/**
 * The liability waiver a parent agrees to when registering.
 *
 * The program's waiver is a PDF ("CIS Liability Waiver & Parental Consent").
 * Its text is shown on the form itself, word for word, so a parent reads it on
 * their phone right above the boxes they tick -- the first box refers to "the
 * release of liability statement above". This is a copy: if the church changes
 * the waiver, change it here too.
 *
 * Consent is still stored as one timestamp (`consent_given_at`), stamped by
 * `register_kid()` only when every statement is ticked. Nothing records which
 * version of the PDF was in force, so if it is ever materially rewritten,
 * consider recording that.
 */

export const WAIVER_TITLE = 'Liability waiver';

export const WAIVER_HEADING = 'Release of liability. Please read carefully before agreeing.';

/** The release, in the PDF's paragraphs. */
export const WAIVER_PARAGRAPHS: readonly string[] = [
  'I, the undersigned parent or legal guardian, hereby enroll my child in the CIS – Christ in Sports program hosted by St. Antonius Coptic Orthodox Church, located at 250 Hansen Road, Hayward, CA.',
  'I understand and acknowledge that participation in CIS activities—including but not limited to camping, field trips and other off-site activities, cooking, sports, arts and crafts, recreational games, service projects, hiking, and other program activities—involves inherent risks of injury, illness, or property loss. I voluntarily assume all such risks on behalf of my child.',
  "In consideration of my child's participation, I hereby release, waive, discharge, and hold harmless St. Antonius Coptic Orthodox Church, its clergy, servants, volunteers, staff, and agents from any and all claims, demands, or causes of action arising from injury, illness, loss, or damage sustained by my child during the program, whether caused by negligence or otherwise, to the fullest extent permitted by law.",
  "I further authorize the church's servants and volunteers to seek and consent to emergency medical treatment for my child if I cannot be reached, and I agree to be responsible for all medical expenses incurred.",
];

/** The PDF's closing acknowledgment, shown under the boxes. */
export const WAIVER_ACKNOWLEDGMENT =
  'By agreeing electronically, I acknowledge that I have read, understood, and agree to the terms of this Liability Waiver & Parental Consent. I certify that I am the parent or legal guardian of the child named on this registration form and have the legal authority to provide this consent.';

export interface WaiverStatement {
  id: 'release' | 'medical' | 'participation' | 'media';
  text: string;
}

/** The four statements a parent must tick, in the PDF's order. */
export const WAIVER_STATEMENTS: readonly WaiverStatement[] = [
  {
    id: 'release',
    text: 'I have read and fully understand the release of liability statement above and agree to its terms on behalf of my child.',
  },
  {
    id: 'medical',
    text: 'I authorize St. Antonius Coptic Orthodox Church servants and volunteers to seek emergency medical care for my child if I cannot be reached and I accept responsibility for any resulting medical expenses.',
  },
  {
    id: 'participation',
    text: 'I give permission for my child to participate in all St. Antonius CIS activities and confirm all information provided in this form is accurate and complete.',
  },
  {
    id: 'media',
    text: 'I understand that photos or videos may be taken during the program for church ministry purposes and consent to their use.',
  },
];

export const WAIVER_ERROR = 'Tick all four boxes to agree to the waiver';

/** Agreed only when every statement is ticked. */
export function waiverAgreed(ticked: readonly string[]): boolean {
  return WAIVER_STATEMENTS.every((s) => ticked.includes(s.id));
}
