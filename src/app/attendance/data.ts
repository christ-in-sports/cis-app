import { redirect } from 'next/navigation';
import { getMyRoles } from '@/lib/auth/roles';
import { embeddedOne, type RosterKid } from '@/lib/attendance';

export async function attendanceAccess(manager = false) {
  const auth = await getMyRoles();
  if (!auth.userId) redirect('/login?redirect=/attendance');
  const canManage = auth.roles.has('admin') || auth.roles.has('program');
  if (!canManage && (manager || !auth.roles.has('coach'))) redirect('/');
  return { ...auth, canManage, isAdmin: auth.roles.has('admin') };
}

export function rosterRows(rows: { id: string; kid_id: string; grade: number; division: 'juniors' | 'ambassadors'; team_id: string | null; kids: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] }[]): RosterKid[] {
  return rows.flatMap((row) => {
    const kid = embeddedOne(row.kids);
    return kid ? [{ id: row.id, kid_id: row.kid_id, grade: row.grade, division: row.division, team_id: row.team_id, ...kid }] : [];
  });
}
