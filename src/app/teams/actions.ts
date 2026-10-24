'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assignmentInput, renameTeamInput, teamInput } from '@/lib/attendance-input';
import { requireTeamManager, currentTeamSeason } from './data';

async function mutate(work: () => Promise<void>) {
  try {
    await work();
    revalidatePath('/teams', 'layout');
    revalidatePath('/attendance', 'layout');
    revalidatePath('/sports', 'layout');
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : 'Could not save. Try again.' };
  }
}

export async function createTeam(input: unknown) {
  return mutate(async () => {
    const { supabase } = await requireTeamManager();
    const v = teamInput.parse(input);
    const season = await currentTeamSeason(supabase);
    if (!season) throw new Error('Set up a current season before creating a team.');
    const { error } = await supabase.from('ministry_teams').insert({ name: v.name, division: v.division, season_id: season.id });
    if (error?.code === '23505') throw new Error('A current team with that name already exists in this division.');
    if (error) throw new Error(error.message);
  });
}

export async function renameTeam(input: unknown) {
  return mutate(async () => {
    const { supabase } = await requireTeamManager();
    const v = renameTeamInput.parse(input);
    const { error } = await supabase.from('ministry_teams').update({ name: v.name })
      .eq('id', v.teamId).eq('active', true).is('archived_at', null).is('deleted_at', null).select('id').single();
    if (error?.code === '23505') throw new Error('A current team with that name already exists in this division.');
    if (error) throw new Error(error.message);
  });
}

export async function deleteTeam(teamId: string) {
  return mutate(async () => {
    const { supabase } = await requireTeamManager();
    const { error } = await supabase.rpc('delete_attendance_team', { p_team: z.uuid().parse(teamId) });
    if (error) throw new Error(error.message);
  });
}

export async function assignKids(input: unknown) {
  return mutate(async () => {
    const { supabase } = await requireTeamManager();
    const v = assignmentInput.parse(input);
    const { error } = await supabase.rpc('assign_attendance_team', { p_registrations: v.ids, p_team: v.teamId });
    if (error) throw new Error(error.message);
  });
}

export async function assignCoach(teamId: string, coachId: string, assigned: boolean) {
  return mutate(async () => {
    const { supabase } = await requireTeamManager();
    const team = z.uuid().parse(teamId);
    const coach = z.uuid().parse(coachId);
    const { error } = z.boolean().parse(assigned)
      ? await supabase.from('team_coaches').insert({ team_id: team, user_id: coach })
      : await supabase.from('team_coaches').delete().eq('team_id', team).eq('user_id', coach);
    if (error) throw new Error(error.message);
  });
}
