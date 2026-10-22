/**
 * Signed links for the kid photos on a page (ENG-21 / ENG-23). Server only.
 *
 * The bucket is private and an `<img>` sends no login, so a page cannot link to
 * a photo directly. Instead the server asks Storage, as the signed-in user, for
 * a link to each photo that user may see: the storage read policy decides which
 * paths get one, so a coach is only handed links for their own team. The links
 * stop working after an hour.
 *
 * All the photos on a page are signed in one request. A failure never breaks the
 * page: a kid without a link shows their initials.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { KID_PHOTO_BUCKET, PHOTO_URL_TTL_SECONDS } from '@/lib/validation/photo';

import type { KidPhoto } from './types';

type Client = Pick<SupabaseClient, 'storage' | 'from'>;

/** Kids per `kids` query. Ids travel in the URL, so a roster is read in slices. */
export const KID_ID_CHUNK = 100;

/** path -> signed URL, for every path the caller may read. */
export async function signedPhotoUrls(
  supabase: Pick<SupabaseClient, 'storage'>,
  paths: ReadonlyArray<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;

  const { data, error } = await supabase.storage
    .from(KID_PHOTO_BUCKET)
    .createSignedUrls(unique, PHOTO_URL_TTL_SECONDS);

  if (error || !data) {
    console.error('Signing kid photos failed');
    return urls;
  }
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

/** The `KidPhoto` for a path, or null for a kid with no photo. */
export function toKidPhoto(
  path: string | null | undefined,
  urls: ReadonlyMap<string, string>
): KidPhoto | null {
  return path ? { photoPath: path, signedUrl: urls.get(path) ?? null } : null;
}

/**
 * kid id -> photo, for pages that list kids without selecting `photo_path`
 * (the attendance roster comes from `attendance_day_roster()`, which
 * deliberately returns no photos). The `kids` read is under the caller's RLS, so
 * a kid they cannot read, such as one on an archived day they no longer coach,
 * has no entry.
 */
export async function loadKidPhotos(
  supabase: Client,
  kidIds: ReadonlyArray<string>
): Promise<Map<string, KidPhoto>> {
  const ids = [...new Set(kidIds)];
  const rows: { id: string; photo_path: string | null }[] = [];

  for (let i = 0; i < ids.length; i += KID_ID_CHUNK) {
    const { data, error } = await supabase
      .from('kids')
      .select('id, photo_path')
      .in('id', ids.slice(i, i + KID_ID_CHUNK))
      .not('photo_path', 'is', null);
    if (error) {
      console.error('Loading kid photos failed');
      return new Map();
    }
    rows.push(...((data ?? []) as { id: string; photo_path: string | null }[]));
  }

  const urls = await signedPhotoUrls(supabase, rows.map((r) => r.photo_path));
  const photos = new Map<string, KidPhoto>();
  for (const row of rows) {
    const photo = toKidPhoto(row.photo_path, urls);
    if (photo) photos.set(row.id, photo);
  }
  return photos;
}
