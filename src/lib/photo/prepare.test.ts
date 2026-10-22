import { PhotoError, outputSize, preparePhoto, squareCrop } from './prepare';

const heicTo = jest.fn();
jest.mock('heic-to/csp', () => ({ heicTo: (...args: unknown[]) => heicTo(...args) }), { virtual: true });

describe('squareCrop', () => {
  it('centres a landscape photo, dropping the sides equally', () => {
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000 });
  });

  it('centres a portrait photo, dropping the top and bottom equally', () => {
    expect(squareCrop(3000, 4000)).toEqual({ sx: 0, sy: 500, size: 3000 });
  });

  it('keeps a square photo whole', () => {
    expect(squareCrop(800, 800)).toEqual({ sx: 0, sy: 0, size: 800 });
  });
});

describe('outputSize', () => {
  it('shrinks a large photo to 512', () => {
    expect(outputSize(3000)).toBe(512);
  });

  it('never upscales a small one', () => {
    expect(outputSize(200)).toBe(200);
  });
});

describe('preparePhoto', () => {
  const drawImage = jest.fn();
  const close = jest.fn();
  let toBlob: jest.Mock;
  const bitmap = { width: 4000, height: 3000, close } as unknown as ImageBitmap;

  const file = (name: string, type: string, size = 1_000_000) => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  /** `toBlob` answers per requested type; anything unlisted comes back as a PNG, as browsers do. */
  const encodes = (supported: Record<string, number>) => {
    toBlob.mockImplementation((cb: BlobCallback, type: string) => {
      const size = supported[type];
      cb(size === undefined ? new Blob(['png'], { type: 'image/png' }) : new Blob([new Uint8Array(size)], { type }));
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    toBlob = jest.fn();
    (global as unknown as { createImageBitmap: jest.Mock }).createImageBitmap = jest.fn().mockResolvedValue(bitmap);
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob);
    encodes({ 'image/webp': 40_000 });
  });

  afterEach(() => jest.restoreAllMocks());

  it('crops to the centred square, shrinks to 512 and stores WebP', async () => {
    const photo = await preparePhoto(file('a.jpg', 'image/jpeg'));

    expect(drawImage).toHaveBeenCalledWith(bitmap, 500, 0, 3000, 3000, 0, 0, 512, 512);
    expect(photo).toMatchObject({ contentType: 'image/webp', extension: 'webp', width: 512, height: 512 });
    expect(photo.blob.size).toBe(40_000);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('falls back to JPEG where the browser cannot encode WebP', async () => {
    encodes({ 'image/jpeg': 60_000 });

    const photo = await preparePhoto(file('a.jpg', 'image/jpeg'));

    expect(photo).toMatchObject({ contentType: 'image/jpeg', extension: 'jpg' });
  });

  it('refuses an encoding over the bucket limit rather than uploading it', async () => {
    encodes({ 'image/webp': 3_000_000, 'image/jpeg': 3_000_000 });

    await expect(preparePhoto(file('a.jpg', 'image/jpeg'))).rejects.toMatchObject({ code: 'encode-failed' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized file before decoding it', async () => {
    await expect(preparePhoto(file('big.jpg', 'image/jpeg', 16 * 1024 * 1024))).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects a file that is not an image', async () => {
    await expect(preparePhoto(file('notes.pdf', 'application/pdf'))).rejects.toMatchObject({ code: 'invalid' });
  });

  it('reports a photo the browser cannot read', async () => {
    (createImageBitmap as jest.Mock).mockRejectedValue(new Error('bad'));

    const err = await preparePhoto(file('a.jpg', 'image/jpeg')).catch((e) => e);

    expect(err).toBeInstanceOf(PhotoError);
    expect(err.code).toBe('unreadable');
    expect(heicTo).not.toHaveBeenCalled();
  });

  describe('HEIC', () => {
    it('uses the browser decoder when it has one, so nothing extra is downloaded', async () => {
      await preparePhoto(file('IMG_1.HEIC', ''));

      expect(heicTo).not.toHaveBeenCalled();
    });

    it('falls back to the converter when the browser cannot decode it', async () => {
      (createImageBitmap as jest.Mock).mockRejectedValue(new Error('unsupported'));
      heicTo.mockResolvedValue(bitmap);
      const heic = file('IMG_1.HEIC', '');

      const photo = await preparePhoto(heic);

      expect(heicTo).toHaveBeenCalledWith({ blob: heic, type: 'bitmap' });
      expect(photo.contentType).toBe('image/webp');
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('tells the parent what to do when conversion fails', async () => {
      (createImageBitmap as jest.Mock).mockRejectedValue(new Error('unsupported'));
      heicTo.mockRejectedValue(new Error('bad heic'));

      const err = await preparePhoto(file('IMG_1.HEIC', 'image/heic')).catch((e) => e);

      expect(err.code).toBe('heic-failed');
      expect(err.message).toMatch(/JPEG/);
      expect(err.message).toMatch(/Most Compatible/);
    });
  });
});
