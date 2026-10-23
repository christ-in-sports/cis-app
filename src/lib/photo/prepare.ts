/**
 * Turns the file a parent picked into the small square photo we store
 * (ENG-21 / ENG-23). Runs in the browser only: it needs canvas, and it keeps
 * the original, location data and all, on the parent's device.
 *
 *   pick a file  ->  decode  ->  centre-crop to a square  ->  shrink to 512 px
 *               ->  encode as WebP (JPEG where the browser cannot)
 *
 * Drawing to a canvas and re-encoding drops EXIF, including GPS, which matters
 * for photos of minors. iPhone photos are usually HEIC, which only Safari can
 * display, so a HEIC file is decoded here and never stored: the browser's own
 * decoder first (Safari), otherwise a libheif-based converter that is loaded
 * only when a HEIC file is actually picked. That happens in the browser because
 * the prebuilt `sharp` on Vercel has no HEIC decoder.
 */

import {
  MAX_PHOTO_OUTPUT_BYTES,
  PHOTO_SIZE,
  isHeicFile,
  photoFileSchema,
} from '@/lib/validation/photo';

export type PhotoErrorCode =
  | 'invalid'
  | 'unreadable'
  | 'heic-failed'
  | 'encode-failed'
  | 'upload-failed'
  | 'save-failed';

/** An error whose message is safe to show to a parent as it is. */
export class PhotoError extends Error {
  constructor(
    public readonly code: PhotoErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

export interface PreparedPhoto {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg';
  /** The file extension the storage policy allows for `contentType`. */
  extension: 'webp' | 'jpg';
  width: number;
  height: number;
}

/**
 * The largest centred square in a `width` x `height` image, as the source
 * rectangle to draw from. Portrait and landscape photos lose their long edge
 * equally; a faces-near-the-top bias was considered and left out so the crop
 * is predictable.
 */
export function squareCrop(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size };
}

/** The stored photo is never upscaled: a small source stays small. */
export function outputSize(sourceSquare: number): number {
  return Math.max(1, Math.min(PHOTO_SIZE, sourceSquare));
}

async function decode(file: File): Promise<ImageBitmap> {
  const heic = isHeicFile(file);
  try {
    // Honours the photo's own rotation. Safari also decodes HEIC here.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (!heic) {
      throw new PhotoError('unreadable', 'That file could not be read as a photo. Try a different one.');
    }
  }

  try {
    // `/csp` is the build that does not need `unsafe-eval`. Dynamic, so the
    // ~0.8 MB (gzipped) converter is only downloaded for a HEIC file that the
    // browser could not read itself.
    const { heicTo } = await import('heic-to/csp');
    return await heicTo({ blob: file, type: 'bitmap' });
  } catch {
    throw new PhotoError(
      'heic-failed',
      'That photo could not be converted. Choose a JPEG instead, or on an iPhone set Settings > Camera > Formats to Most Compatible.'
    );
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * `toBlob` quietly falls back to PNG for a type it cannot encode, so the result
 * is accepted only if it really is the type that was asked for.
 */
async function encode(canvas: HTMLCanvasElement): Promise<{ blob: Blob; type: 'image/webp' | 'image/jpeg' }> {
  for (const type of ['image/webp', 'image/jpeg'] as const) {
    const blob = await toBlob(canvas, type, 0.85);
    if (blob && blob.type === type && blob.size <= MAX_PHOTO_OUTPUT_BYTES) return { blob, type };
  }
  throw new PhotoError('encode-failed', 'That photo could not be prepared. Try a different one.');
}

/** Validates, decodes, crops, shrinks and encodes the picked file. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const checked = photoFileSchema.safeParse({ name: file.name, type: file.type, size: file.size });
  if (!checked.success) {
    throw new PhotoError('invalid', checked.error.issues[0]?.message ?? 'Choose a different photo.');
  }

  const bitmap = await decode(file);
  try {
    const { sx, sy, size } = squareCrop(bitmap.width, bitmap.height);
    const out = outputSize(size);

    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('encode-failed', 'That photo could not be prepared. Try a different one.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sx, sy, size, size, 0, 0, out, out);

    const { blob, type } = await encode(canvas);
    return {
      blob,
      contentType: type,
      extension: type === 'image/webp' ? 'webp' : 'jpg',
      width: out,
      height: out,
    };
  } finally {
    bitmap.close();
  }
}
