/**
 * @jest-environment node
 */
import { KID_ID_CHUNK, loadKidPhotos, signedPhotoUrls, toKidPhoto } from './signed-urls';

const createSignedUrls = jest.fn();
const storage = { from: jest.fn(() => ({ createSignedUrls })) };

const signed = (paths: string[]) => ({
  data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}?token=1`, error: null })),
  error: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('signedPhotoUrls', () => {
  it('signs every path in one request, for an hour, and de-duplicates', async () => {
    createSignedUrls.mockImplementation(async (paths: string[]) => signed(paths));

    const urls = await signedPhotoUrls({ storage } as never, ['a.webp', 'b.webp', 'a.webp', null, undefined]);

    expect(storage.from).toHaveBeenCalledWith('kid-photos');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['a.webp', 'b.webp'], 3600);
    expect(urls.get('b.webp')).toBe('https://signed/b.webp?token=1');
  });

  it('makes no request when there is nothing to sign', async () => {
    const urls = await signedPhotoUrls({ storage } as never, [null, undefined]);

    expect(urls.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('returns no links, rather than failing the page, when signing fails', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'down' } });

    expect((await signedPhotoUrls({ storage } as never, ['a.webp'])).size).toBe(0);
  });

  it('skips a path Storage refused to sign', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a.webp', signedUrl: 'https://signed/a', error: null },
        { path: 'b.webp', signedUrl: '', error: 'Object not found' },
      ],
      error: null,
    });

    const urls = await signedPhotoUrls({ storage } as never, ['a.webp', 'b.webp']);

    expect([...urls.keys()]).toEqual(['a.webp']);
  });
});

describe('toKidPhoto', () => {
  const urls = new Map([['a.webp', 'https://signed/a']]);

  it('is null for a kid with no photo', () => {
    expect(toKidPhoto(null, urls)).toBeNull();
    expect(toKidPhoto(undefined, urls)).toBeNull();
  });

  it('carries the path and its link', () => {
    expect(toKidPhoto('a.webp', urls)).toEqual({ photoPath: 'a.webp', signedUrl: 'https://signed/a' });
  });

  it('keeps the path with no link when signing did not produce one, so the page shows initials', () => {
    expect(toKidPhoto('b.webp', urls)).toEqual({ photoPath: 'b.webp', signedUrl: null });
  });
});

describe('loadKidPhotos', () => {
  /** A `from('kids')` chain that answers by the ids it is asked about. */
  const kidsTable = (known: Record<string, string>) => {
    const queries: string[][] = [];
    const from = jest.fn(() => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          queries.push(ids);
          return {
            not: async () => ({
              data: ids.filter((id) => known[id]).map((id) => ({ id, photo_path: known[id] })),
              error: null,
            }),
          };
        },
      }),
    }));
    return { from, queries };
  };

  it('maps each kid to their photo and signs them together', async () => {
    createSignedUrls.mockImplementation(async (paths: string[]) => signed(paths));
    const { from } = kidsTable({ k1: 'a.webp', k2: 'b.webp' });

    const photos = await loadKidPhotos({ from, storage } as never, ['k1', 'k2', 'k3']);

    expect(photos.get('k1')).toEqual({ photoPath: 'a.webp', signedUrl: 'https://signed/a.webp?token=1' });
    expect(photos.has('k3')).toBe(false);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it('reads a long roster in slices, because ids travel in the URL', async () => {
    createSignedUrls.mockImplementation(async (paths: string[]) => signed(paths));
    const ids = Array.from({ length: KID_ID_CHUNK * 2 + 1 }, (_, i) => `kid-${i}`);
    const { from, queries } = kidsTable({ 'kid-0': 'a.webp', [`kid-${KID_ID_CHUNK * 2}`]: 'z.webp' });

    const photos = await loadKidPhotos({ from, storage } as never, ids);

    expect(queries.map((q) => q.length)).toEqual([KID_ID_CHUNK, KID_ID_CHUNK, 1]);
    expect([...photos.keys()].sort()).toEqual(['kid-0', `kid-${KID_ID_CHUNK * 2}`].sort());
  });

  it('asks once per kid even when a kid is listed twice', async () => {
    const { from, queries } = kidsTable({});

    await loadKidPhotos({ from, storage } as never, ['k1', 'k1']);

    expect(queries).toEqual([['k1']]);
  });

  it('makes no requests for an empty roster', async () => {
    const { from } = kidsTable({});

    expect((await loadKidPhotos({ from, storage } as never, [])).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('shows no photos, rather than failing the page, when the read fails', async () => {
    const from = jest.fn(() => ({ select: () => ({ in: () => ({ not: async () => ({ data: null, error: { code: 'x' } }) }) }) }));

    expect((await loadKidPhotos({ from, storage } as never, ['k1'])).size).toBe(0);
  });
});
