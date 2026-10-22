'use server';

/**
 * Replaces a kid's photo on behalf of the signed-in Admin or Parent
 * (ENG-21 / ENG-23).
 *
 * The browser has already uploaded the new photo (`uploadKidPhoto`), as the
 * user, into the private bucket. This attaches it through `set_kid_photo()`,
 * which re-checks that the caller is an Admin or the kid's parent and that the
 * upload really is theirs, then deletes the photo it replaced. Everything runs
 * on the user's own session; the role check here is for a readable error, not
 * the boundary.
 *
 * A photo can be replaced but never removed, so there is no "remove" action.
 * The order matters: the new path is saved first and the old file deleted
 * after, so a failure leaves a kid with a photo, never a kid pointing at
 * nothing. If the delete fails the old file is left for the daily cleanup.
 */

import { revalidatePath } from 'next/cache';

import { checkAnyRole } from '@/lib/auth/roles';
import { KID_PHOTO_BUCKET, replaceKidPhotoSchema } from '@/lib/validation/photo';

export interface ReplaceKidPhotoResult {
  ok: boolean;
  error?: string;
}

const FORBIDDEN = '42501';
const UPLOAD_NOT_FOUND = '02000';
const ALREADY_USED = '23505';

export async function replaceKidPhoto(input: unknown): Promise<ReplaceKidPhotoResult> {
  const { supabase, userId, hasRole } = await checkAnyRole(['admin', 'parent']);

  if (userId === null) {
    return { ok: false, error: 'You are no longer signed in.' };
  }
  if (!hasRole) {
    return { ok: false, error: 'Only an Admin or the kid’s parent can change a photo.' };
  }

  const parsed = replaceKidPhotoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'That photo could not be used. Choose it again.' };
  }

  const { data: replacedPath, error } = await supabase.rpc('set_kid_photo', {
    p_kid: parsed.data.kid_id,
    p_path: parsed.data.photo_path,
  });

  if (error) {
    switch (error.code) {
      case FORBIDDEN:
        return { ok: false, error: 'You can only change the photo of your own kids.' };
      case UPLOAD_NOT_FOUND:
        return { ok: false, error: 'The photo upload was not found. Choose the photo again.' };
      case ALREADY_USED:
        return { ok: false, error: 'That photo is already used by another kid. Choose it again.' };
    }

    // The message can name a kid or a photo, and these are minors' records.
    console.error('set_kid_photo failed:', error.code);
    return { ok: false, error: 'Could not save the photo.' };
  }

  if (replacedPath) {
    // The storage policy lets the uploader or an Admin delete an object once no
    // kid uses it. Anyone else (a parent replacing a photo an Admin uploaded)
    // is quietly refused, and the daily cleanup removes it instead.
    const { error: removeError } = await supabase.storage.from(KID_PHOTO_BUCKET).remove([replacedPath]);
    if (removeError) console.error('Removing a replaced kid photo failed');
  }

  revalidatePath('/register');
  revalidatePath('/registrations');
  revalidatePath('/attendance', 'layout');

  return { ok: true };
}
