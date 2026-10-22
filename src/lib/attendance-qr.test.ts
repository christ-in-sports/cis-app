/** @jest-environment node */
import QRCode from 'qrcode';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { attendanceQrInput, attendanceQrValue } from './attendance-qr';

const kidId = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';
const dayId = 'c885f8bc-347d-4a99-82ea-d36bb1b35554';

it('encodes a stable kid identifier and rejects foreign or malformed QR codes', () => {
  const code = attendanceQrValue(kidId);
  expect(attendanceQrInput.parse({ dayId, code })).toEqual({ dayId, code: kidId });
  for (const value of [kidId, 'https://example.com', 'cis:attendance:v1:invalid', `cis:attendance:v2:${kidId}`, code + 'extra']) {
    expect(attendanceQrInput.safeParse({ dayId, code: value }).success).toBe(false);
  }
  expect(attendanceQrInput.safeParse({ dayId: 'invalid', code }).success).toBe(false);
});

it('generates a QR that the scanner decoder can read with a print quiet zone', () => {
  const value = attendanceQrValue(kidId);
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const scale = 6, margin = 4, width = (qr.modules.size + 2 * margin) * scale;
  const pixels = new Int32Array(width * width).fill(0xffffff);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const mx = Math.floor(x / scale) - margin, my = Math.floor(y / scale) - margin;
    if (mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(my, mx)) pixels[y * width + x] = 0;
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, width)));
  expect(new QRCodeReader().decode(bitmap).getText()).toBe(value);
});
