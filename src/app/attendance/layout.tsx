import type { ReactNode } from 'react';

import { redirectIfRoleless } from '@/lib/auth/servant-gate';

/**
 * Attendance has no frame of its own; this layout exists so a servant who has
 * not been given a role yet is sent to the registration form. RLS already
 * returns them nothing here, so this is only to spare them an empty screen.
 */
export default async function AttendanceLayout({ children }: { children: ReactNode }) {
  await redirectIfRoleless();
  return children;
}
