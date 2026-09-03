import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import TeamsClient from './teams-client';

export default async function TeamsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/attendance/teams');

  const { data: profile } = await supabase
    .from('profiles').select('is_staff').eq('id', user.id).single();

  const [{ data: teams }, { data: kids }, { data: coaches }, { data: links }] =
    await Promise.all([
      supabase.from('ministry_teams').select('id, name, session, active').order('name'),
      supabase.from('registrations')
        .select('id, first_name, last_name, grade, session, team_id')
        .eq('active', true)
        .order('last_name'),
      supabase.from('profiles')
        .select('id, display_name, email')
        .or('is_coach.eq.true,is_staff.eq.true')
        .order('display_name'),
      supabase.from('team_coaches').select('team_id, user_id'),
    ]);

  return (
    <TeamsClient
      isStaff={!!profile?.is_staff}
      teams={teams ?? []}
      kids={kids ?? []}
      coaches={coaches ?? []}
      links={links ?? []}
    />
  );
}