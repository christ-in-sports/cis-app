/**
 * `authFrameClasses`: the box every signed-out screen (login, signup, join, password
 * reset) holds its card in.
 *
 * The card sits at the top, just under the appearance switch, and the page is only
 * as tall as its content. It used to be a full-screen box that centred the card,
 * which on a phone left a gap of 100px or more below the switch and made the page
 * scroll by the switch's own height.
 */
export const authFrameClasses = 'flex justify-center p-4 pt-2 sm:pt-8 safe-bottom';
