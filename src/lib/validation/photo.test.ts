/**
 * @jest-environment node
 */
import {
  MAX_PHOTO_INPUT_BYTES,
  isHeicFile,
  kidPhotoPathSchema,
  photoFileSchema,
  replaceKidPhotoSchema,
} from './photo';

const UUID = '4f3c1d52-9c7e-4d52-8a35-0b1f2f6c7a11';

describe('kidPhotoPathSchema', () => {
  it.each([`${UUID}.webp`, `${UUID}.jpg`])('accepts %s', (path) => {
    expect(kidPhotoPathSchema.safeParse(path).success).toBe(true);
  });

  it.each([
    'photo.webp',
    `folder/${UUID}.webp`,
    `${UUID}.png`,
    `${UUID}.heic`,
    `${UUID}.webp.exe`,
    `${UUID.toUpperCase()}.webp`,
    '',
  ])('rejects %s', (path) => {
    expect(kidPhotoPathSchema.safeParse(path).success).toBe(false);
  });
});

describe('isHeicFile', () => {
  it.each([
    { name: 'IMG_0001.HEIC', type: '' },
    { name: 'photo.heif', type: 'application/octet-stream' },
    { name: 'photo', type: 'image/heic' },
    { name: 'photo', type: 'IMAGE/HEIF' },
  ])('recognises %o', (file) => {
    expect(isHeicFile(file)).toBe(true);
  });

  it.each([
    { name: 'photo.jpg', type: 'image/jpeg' },
    { name: 'heic.png', type: 'image/png' },
  ])('does not mistake %o for HEIC', (file) => {
    expect(isHeicFile(file)).toBe(false);
  });
});

describe('photoFileSchema', () => {
  it('accepts a normal phone photo', () => {
    expect(photoFileSchema.safeParse({ name: 'a.jpg', type: 'image/jpeg', size: 4_000_000 }).success).toBe(true);
  });

  it('accepts a HEIC file whose browser reports no type', () => {
    expect(photoFileSchema.safeParse({ name: 'IMG_1.HEIC', type: '', size: 2_000_000 }).success).toBe(true);
  });

  it('rejects a file over the input limit, with a message a parent can act on', () => {
    const r = photoFileSchema.safeParse({ name: 'a.jpg', type: 'image/jpeg', size: MAX_PHOTO_INPUT_BYTES + 1 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/under 15 MB/);
  });

  it('accepts a file exactly at the limit', () => {
    expect(photoFileSchema.safeParse({ name: 'a.jpg', type: 'image/jpeg', size: MAX_PHOTO_INPUT_BYTES }).success).toBe(true);
  });

  it.each([
    { name: 'notes.pdf', type: 'application/pdf', size: 1000 },
    { name: 'empty.jpg', type: 'image/jpeg', size: 0 },
  ])('rejects %o', (file) => {
    expect(photoFileSchema.safeParse(file).success).toBe(false);
  });
});

describe('replaceKidPhotoSchema', () => {
  const kid = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';

  it('accepts a kid id and an upload path', () => {
    expect(replaceKidPhotoSchema.safeParse({ kid_id: kid, photo_path: `${UUID}.webp` }).success).toBe(true);
  });

  it.each([
    { kid_id: 'not-a-uuid', photo_path: `${UUID}.webp` },
    { kid_id: kid, photo_path: 'x.webp' },
    { kid_id: kid },
    {},
  ])('rejects %o', (input) => {
    expect(replaceKidPhotoSchema.safeParse(input).success).toBe(false);
  });
});
