import { z } from 'zod';

export const attendanceStatus = z.enum(['unmarked', 'present', 'absent', 'late', 'excused']);
export const sessionInput = z.object({ date: z.iso.date() });
export const markInput = z.object({
  dayId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(500),
  status: attendanceStatus,
  note: z.string().trim().max(1000).optional(),
  onlyUnmarked: z.boolean().default(false),
});
export const teamInput = z.object({
  name: z.string().trim().min(1).max(80),
  division: z.enum(['juniors', 'ambassadors']),
});
export const assignmentInput = z.object({ ids: z.array(z.uuid()).min(1).max(500), teamId: z.uuid().nullable() });
