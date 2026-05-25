import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import OverallClient from './overall-client';

export default async function OverallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();

  if (!tournament) redirect('/dashboard');

  const [
    { data: teams },
    { data: sports },
    { data: matches },
    { data: scores },
    { data: standings },
  ] = await Promise.all([
    supabase.from('teams').select('*').eq('tournament_id', id).order('seed'),
    supabase.from('sports').select('*').eq('tournament_id', id),
    supabase.from('matches').select('*').eq('tournament_id', id),
    supabase.from('match_scores').select('*, matches!inner(tournament_id)').eq('matches.tournament_id', id),
    supabase.from('standings').select('*, sports!inner(tournament_id)').eq('sports.tournament_id', id),
  ]);

  const membership = user
    ? await supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).single()
    : { data: null };

  const isAdmin = membership?.data && ['owner', 'admin'].includes(membership.data.role);

  return (
    <OverallClient
      tournament={tournament}
      teams={teams || []}
      sports={sports || []}
      matches={matches || []}
      scores={scores || []}
      standings={standings || []}
      isAdmin={!!isAdmin}
    />
  );
}