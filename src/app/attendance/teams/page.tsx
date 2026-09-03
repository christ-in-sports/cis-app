import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import TeamsClient from './teams-client';

export default async function TeamsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/attendance/teams');

  const { data: profile } = await supabase
    .from('profiles').select('is_staff').eq('id', user.id).single();

  const [{ data: teams }, { data: kids }, { data: coaches }] = await Promise.all([
    supabase.from('ministry_teams').select('*').order('name'),
    supabase.from('registrations')
      .select('id, first_name, last_name, grade, session, team_id')
      .eq('active', true)
      .order('last_name'),
    supabase.from('profiles').select('id, display_name, email').order('display_name'),
  ]);

  return (
    <TeamsClient
      isStaff={!!profile?.is_staff}
      teams={teams ?? []}
      kids={kids ?? []}
      coaches={coaches ?? []}
    />
  );
}