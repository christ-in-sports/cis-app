import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SetupClient from './setup-client';

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();

  if (!tournament) redirect('/dashboard');

  // Check permission
  const { data: membership } = await supabase
    .from('tournament_members')
    .select('role')
    .eq('tournament_id', id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    redirect('/dashboard');
  }

  // Get existing teams
  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .eq('tournament_id', id)
    .order('seed', { ascending: true });

  // Get existing sport configs
  const { data: sports } = await supabase
    .from('sports')
    .select('*')
    .eq('tournament_id', id);

  return (
    <SetupClient
      tournament={tournament}
      existingTeams={teams || []}
      existingSports={sports || []}
      userId={user.id}
    />
  );
}