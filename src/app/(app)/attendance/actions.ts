'use server';

import { attendanceQrInput } from '@/lib/attendance-qr';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMyRoles } from '@/lib/auth/roles';
import { markInput, sessionInput } from '@/lib/attendance-input';

async function access(manager: boolean) {
  const auth = await getMyRoles();
  if (!auth.userId || !(auth.roles.has('admin') || auth.roles.has('program') || (!manager && auth.roles.has('coach')))) {
    throw new Error('You do not have permission to do that.');
  }
  return auth;
}

/** Return failures to the form; never serialize a database record or kid data. */
async function mutate(work: () => Promise<string | void>) {
  try {
    const id = await work();
    revalidatePath('/attendance', 'layout');
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : 'Could not save. Try again.' };
  }
}

export async function createSession(input: unknown) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const v = sessionInput.parse(input);
    const { data, error } = await supabase.rpc('create_attendance_date', { p_date: v.date });
    if (error) throw new Error(error.message);
    return data as string;
  });
}

export async function saveMarks(input: unknown) {
  return mutate(async () => {
    const { supabase, roles } = await access(false);
    if (!roles.has('admin') && !roles.has('coach')) throw new Error('Only Admin and assigned coaches can mark attendance.');
    const v = markInput.parse(input);
    let query = supabase.from('attendance_records').update({ status: v.status, ...(v.note !== undefined ? { note: v.note } : {}) })
      .eq('day_id', v.dayId).in('id', v.ids);
    if (v.onlyUnmarked) query = query.eq('status', 'unmarked');
    const { data, error } = await query.select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Nothing saved. The roster or your team assignment may have changed; refresh and try again.');
  });
}

export async function refreshAttendance(dayId: string) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const { error } = await supabase.rpc('populate_attendance_day', { p_day: z.uuid().parse(dayId) });
    if (error) throw new Error(error.message);
  });
}

export async function lockAttendance(dayId: string, locked: boolean) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const { data, error } = await supabase.from('attendance_days').update({ locked: z.boolean().parse(locked) })
      .eq('id', z.uuid().parse(dayId)).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'Session no longer exists.');
  });
}

export async function archiveAttendance() {
  return mutate(async () => {
    const { supabase } = await access(true);
    const { error } = await supabase.rpc('archive_current_attendance');
    if (error) throw new Error(error.message);
    revalidatePath('/teams', 'layout');
    revalidatePath('/sports', 'layout');
  });
}

export async function restoreAttendance(dayId: string) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const { data, error } = await supabase.from('attendance_days').update({ archived_at: null, locked: false })
      .eq('id', z.uuid().parse(dayId)).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'Attendance day no longer exists.');
  });
}

export async function deleteAttendance(dayId: string) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const { data, error } = await supabase.from('attendance_days').delete()
      .eq('id', z.uuid().parse(dayId)).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'Attendance day no longer exists.');
  });
}

/** Resolve against the authenticated day roster; never trust a client record ID. */
export async function scanAttendance(input: unknown) {
  try {
    const { supabase, roles } = await access(false);
    if (!roles.has('admin') && !roles.has('coach')) throw new Error('Only Admin and assigned coaches can scan attendance.');
    const { dayId, code: kidId } = attendanceQrInput.parse(input);
    const { data: day, error: dayError } = await supabase.from('attendance_days')
      .select('locked, archived_at').eq('id', dayId).maybeSingle();
    if (dayError || !day) throw new Error('Could not load this attendance day.');
    if (day.locked || day.archived_at) throw new Error('This attendance day is locked or archived.');
    const { data: roster, error } = await supabase.rpc('attendance_day_roster', { p_day: dayId });
    if (error) throw new Error('Could not load this attendance roster.');
    const row = (roster as { id: string; kid_id: string; first_name: string; last_name: string; status: string }[] | null)
      ?.find((row) => row.kid_id === kidId);
    if (!row) throw new Error('This code is not on your accessible roster for this day.');
    const name = `${row.first_name} ${row.last_name}`;
    if (row.status === 'present' || row.status === 'late') return { ok: true as const, message: `${name} is already ${row.status}.` };
    // RLS checks the current team assignment again on update. Preserve notes and late marks.
    const { data: saved, error: saveError } = await supabase.from('attendance_records')
      .update({ status: 'present' }).eq('day_id', dayId).eq('id', row.id)
      .in('status', ['unmarked', 'absent', 'excused']).select('id');
    if (saveError || !saved?.length) throw new Error('Nothing saved. Refresh and scan again; the day or your team assignment may have changed.');
    revalidatePath('/attendance', 'layout');
    return { ok: true as const, message: `${name} — Present, saved.` };
  } catch (error) {
    return { ok: false as const, error: error instanceof z.ZodError ? 'This is not a valid CIS attendance QR code.' : error instanceof Error ? error.message : 'Could not save. Scan again.' };
  }
}
