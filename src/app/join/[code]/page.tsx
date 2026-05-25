import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import JoinClient from './join-client';

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('*')
    .ilike('share_code', code)
    .single();

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-2xl mb-2">❌</p>
          <p className="text-lg font-bold">Invalid Code</p>
          <p className="text-muted-foreground text-sm mt-1">No tournament found with code &quot;{code}&quot;</p>
        </div>
      </div>
    );
  }

  // If logged in, check if already a member
  if (user) {
    const { data: existing } = await supabase
      .from('tournament_members')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      redirect(`/tournament/${tournament.id}`);
    }
  }

  return (
    <JoinClient
      tournament={tournament}
      isLoggedIn={!!user}
      userId={user?.id || null}
      code={code}
    />
  );
}