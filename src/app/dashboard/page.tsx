import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from './dashboard-client';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch user's tournaments
  const { data: memberships } = await supabase
    .from('tournament_members')
    .select(`
      role,
      tournaments (
        id,
        name,
        status,
        team_count,
        current_sport,
        share_code,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });

  const formatted = (memberships || []).map((m: any) => ({
    role: m.role,
    tournaments: Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments,
  }));

  return <DashboardClient user={user} memberships={formatted} />;
}