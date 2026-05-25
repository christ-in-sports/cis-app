import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import TournamentHub from './tournament-hub';

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();

  if (!tournament) redirect('/dashboard');

  if (tournament.status === 'setup') {
    if (user) {
      const { data: membership } = await supabase
        .from('tournament_members')
        .select('role')
        .eq('tournament_id', id)
        .eq('user_id', user.id)
        .single();

      if (membership && ['owner', 'admin'].includes(membership.role)) {
        redirect(`/tournament/${id}/setup`);
      }
    }
    return <div className="p-4">This tournament is still being set up.</div>;
  }

  // Fetch all data
  const [
    { data: teams },
    { data: sports },
    { data: matches },
    { data: scores },
    { data: standings },
    { data: membership },
  ] = await Promise.all([
    supabase.from('teams').select('*').eq('tournament_id', id).order('seed'),
    supabase.from('sports').select('*').eq('tournament_id', id),
    supabase.from('matches').select('*').eq('tournament_id', id).order('round').order('scheduled_time'),
    supabase.from('match_scores').select('*, matches!inner(tournament_id)').eq('matches.tournament_id', id),
    supabase.from('standings').select('*, sports!inner(tournament_id)').eq('sports.tournament_id', id),
    user
      ? supabase.from('tournament_members').select('role').eq('tournament_id', id).eq('user_id', user.id).single()
      : { data: null },
  ]);

  const userRole = membership?.role || 'viewer';
  const isAdmin = ['owner', 'admin'].includes(userRole);

  return (
    <TournamentHub
      tournament={tournament}
      teams={teams || []}
      sports={sports || []}
      matches={matches || []}
      scores={scores || []}
      standings={standings || []}
      isAdmin={isAdmin}
      userId={user?.id || null}
    />
  );
}