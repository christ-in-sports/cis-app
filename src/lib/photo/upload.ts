/**
 * Uploads a prepared photo to the private `kid-photos` bucket as the signed-in
 * user (ENG-21 / ENG-23). Browser only.
 *
 * It uses the user's own session, never the service role, so the storage INSERT
 * policy is what decides: only an Admin or a Parent may upload, under a random
 * `<uuid>.webp|jpg` name, recorded as theirs. The upload is not attached to a
 * kid yet; the caller passes the returned path to `registerKid` (a new kid) or
 * `replaceKidPhoto`. An upload nobody attaches (an abandoned form) stays in the
 * bucket, unreadable to anyone but its uploader and Admin, until it is deleted
 * by hand.
 */

import { createClient } from '@/lib/supabase/client';
import { KID_PHOTO_BUCKET } from '@/lib/validation/photo';

import { PhotoError, type PreparedPhoto } from './prepare';

/** Uploads under a fresh random name and returns that name (the `photo_path`). */
export async function uploadKidPhoto(photo: PreparedPhoto): Promise<string> {
  const path = `${crypto.randomUUID()}.${photo.extension}`;

  const { error } = await createClient()
    .storage.from(KID_PHOTO_BUCKET)
    .upload(path, photo.blob, { contentType: photo.contentType, upsert: false });

  if (error) {
    throw new PhotoError('upload-failed', 'The photo could not be uploaded. Check your connection and try again.');
  }
  return path;
}
