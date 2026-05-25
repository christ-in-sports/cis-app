import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ScheduleClient from './schedule-client';

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: membership } = await supabase
    .from('tournament_members')
    .select('role')
    .eq('tournament_id', id)
    .eq('user_id', user.id)
    .single();

  const isAdmin = membership && ['owner', 'admin'].includes(membership.role);

  const [
    { data: teams },
    { data: sports },
    { data: matches },
    { data: scores },
    { data: gameDays },
  ] = await Promise.all([
    supabase.from('teams').select('*').eq('tournament_id', id).order('seed'),
    supabase.from('sports').select('*').eq('tournament_id', id),
    supabase.from('matches').select('*').eq('tournament_id', id).order('round'),
    supabase.from('match_scores').select('*, matches!inner(tournament_id)').eq('matches.tournament_id', id),
    supabase.from('game_days').select('*').eq('tournament_id', id).order('date'),
  ]);

  return (
    <ScheduleClient
      tournament={tournament}
      teams={teams || []}
      sports={sports || []}
      matches={matches || []}
      scores={scores || []}
      gameDays={gameDays || []}
      isAdmin={!!isAdmin}
    />
  );
}