/**
 * Deletes the photo file a replacement displaced (ENG-21 / ENG-24). Server only.
 *
 * Called after the new path is saved, never before: a failure then leaves a kid
 * with a photo and an unused file, never a kid pointing at nothing. The storage
 * policy lets the uploader or an Admin delete an object once no kid uses it, and
 * quietly refuses anyone else (a parent replacing a photo an Admin uploaded).
 * Either way the caller carries on, and the file stays until someone deletes it
 * by hand; see `docs/arch_decisions.md`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { KID_PHOTO_BUCKET } from '@/lib/validation/photo';

export async function removeReplacedPhoto(
  supabase: Pick<SupabaseClient, 'storage'>,
  replacedPath: string | null | undefined
): Promise<void> {
  if (!replacedPath) return;

  const { error } = await supabase.storage.from(KID_PHOTO_BUCKET).remove([replacedPath]);
  // The path names a kid's photo, so only the fact is logged.
  if (error) console.error('Removing a replaced kid photo failed');
}
