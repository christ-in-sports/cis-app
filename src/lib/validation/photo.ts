/**
 * Validation for kid photos (ENG-21 / ENG-23).
 *
 * The single source of truth for what a photo may be, shared by the browser
 * (which checks the file a parent picked, before converting it) and the Server
 * Action (which checks the path it is asked to attach). The database repeats the
 * path rule (`kids_photo_path_format`, the storage INSERT policy and
 * `attach_kid_photo()`), and the bucket itself enforces the output size and
 * type, so none of this is the boundary: it exists for readable errors.
 */

import { z } from 'zod';

export const KID_PHOTO_BUCKET = 'kid-photos';

/** The longest edge, in pixels, of the stored square photo. */
export const PHOTO_SIZE = 512;

/** The largest file a parent may pick. Phone photos are a few MB; this stops a file that could freeze an old phone while it is resized. */
export const MAX_PHOTO_INPUT_BYTES = 15 * 1024 * 1024;

/** The bucket's own limit, which Storage enforces whatever the browser does. */
export const MAX_PHOTO_OUTPUT_BYTES = 2 * 1024 * 1024;

/** How long a signed link to a photo works, in seconds. */
export const PHOTO_URL_TTL_SECONDS = 3600;

const HEIC_NAME = /\.(heic|heif)$/i;
const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

/**
 * HEIC is recognised by extension as well as MIME type, because some browsers
 * report an iPhone photo with an empty `type`.
 */
export function isHeicFile(file: { name: string; type: string }): boolean {
  return HEIC_TYPES.has(file.type.toLowerCase()) || HEIC_NAME.test(file.name);
}

/** Matches `kids_photo_path_format` and the storage INSERT policy. */
export const KID_PHOTO_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$/;

export const kidPhotoPathSchema = z.string().regex(KID_PHOTO_PATH, 'That photo is not valid');

/** The `{ name, type, size }` of a `File`, so it can be checked without one. */
export const photoFileSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    size: z
      .number()
      .int()
      .min(1, 'That file is empty')
      .max(MAX_PHOTO_INPUT_BYTES, 'That photo is too large. Choose one under 15 MB.'),
  })
  .refine((f) => f.type.toLowerCase().startsWith('image/') || isHeicFile(f), {
    message: 'Choose an image file',
    path: ['type'],
  });

/** `replaceKidPhoto`: point a kid at a photo the caller already uploaded. */
export const replaceKidPhotoSchema = z.object({
  kid_id: z.uuid('Pick a kid'),
  photo_path: kidPhotoPathSchema,
});

export type ReplaceKidPhotoInput = z.infer<typeof replaceKidPhotoSchema>;
