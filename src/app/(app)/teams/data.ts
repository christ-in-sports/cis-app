import { redirect } from 'next/navigation';
import { getMyRoles } from '@/lib/auth/roles';

/** Check every entry point; RLS remains the database permission boundary. */
export async function requireTeamManager() {
  const auth = await getMyRoles();
  if (!auth.userId || !(auth.roles.has('admin') || auth.roles.has('program'))) {
    throw new Error('Only Admin or Program Team can manage teams.');
  }
  return auth;
}

export async function teamsAccess() {
  const auth = await getMyRoles();
  if (!auth.userId) redirect('/login?redirect=/teams');
  if (!(auth.roles.has('admin') || auth.roles.has('program'))) redirect('/');
  return auth;
}

/** Teams and Sports use the current season, never a previous attendance roster. */
export async function currentTeamSeason(supabase: Awaited<ReturnType<typeof getMyRoles>>['supabase']) {
  const { data, error } = await supabase.from('seasons').select('id, name').eq('is_current', true).maybeSingle();
  if (error) throw new Error('Could not load the current season.');
  return data;
}
