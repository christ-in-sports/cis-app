/**
 * A kid's photo as a page receives it: which photo it is, and a short-lived
 * link to it. `signedUrl` is null when the link could not be made, in which
 * case the page shows the kid's initials instead.
 *
 * `photoPath` is what identifies the photo. The link changes on every page
 * load, so a component must key on the path and keep the first link it saw for
 * it (see KidAvatar, ENG-24).
 */
export interface KidPhoto {
  photoPath: string;
  signedUrl: string | null;
}
