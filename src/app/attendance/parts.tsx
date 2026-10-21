import type { ReactNode } from 'react';
import { Sheet } from '@/components/cis/sheet';

export function AttendanceSheet({ children }: { children: ReactNode }) {
  return <Sheet className="mx-3.5 mb-3.5 space-y-4 p-5">{children}</Sheet>;
}
