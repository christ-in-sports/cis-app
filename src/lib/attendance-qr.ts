import { z } from 'zod';

const prefix = 'cis:attendance:v1:';
export const attendanceQrInput = z.object({
  dayId: z.uuid(),
  code: z.string().max(100).regex(/^cis:attendance:v1:/)
    .transform((value) => value.slice(prefix.length)).pipe(z.uuid()),
});

/** A stable identifier, not a login credential. Authorization is checked at scan time. */
export function attendanceQrValue(kidId: string): string {
  return `${prefix}${z.uuid().parse(kidId)}`;
}
