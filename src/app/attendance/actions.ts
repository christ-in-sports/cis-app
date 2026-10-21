'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMyRoles } from '@/lib/auth/roles';
import { assignmentInput, markInput, sessionInput, teamInput } from '@/lib/attendance-input';

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

export async function createTeam(input: unknown) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const v = teamInput.parse(input);
    const { data: seasonId, error: rosterError } = await supabase.rpc('attendance_roster_season');
    if (rosterError || !seasonId) throw new Error('Add registrations before creating a team.');
    const { error } = await supabase.from('ministry_teams').insert({ name: v.name, division: v.division, season_id: seasonId });
    if (error) throw new Error(error.message);
  });
}

export async function assignKids(input: unknown) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const v = assignmentInput.parse(input);
    const { error } = await supabase.rpc('assign_attendance_team', { p_registrations: v.ids, p_team: v.teamId });
    if (error) throw new Error(error.message);
  });
}

export async function assignCoach(teamId: string, coachId: string, assigned: boolean) {
  return mutate(async () => {
    const { supabase } = await access(true);
    const team = z.uuid().parse(teamId);
    const coach = z.uuid().parse(coachId);
    const { error } = z.boolean().parse(assigned)
      ? await supabase.from('team_coaches').insert({ team_id: team, user_id: coach })
      : await supabase.from('team_coaches').delete().eq('team_id', team).eq('user_id', coach);
    if (error) throw new Error(error.message);
  });
}

export async function archiveAttendance() {
  return mutate(async () => {
    const { supabase } = await access(true);
    const { error } = await supabase.rpc('archive_current_attendance');
    if (error) throw new Error(error.message);
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
