import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MembersClient from './members-client';

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
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

  if (!membership) redirect('/dashboard');

  const { data: members, error } = await supabase
    .from('tournament_members')
    .select(`
      id,
      user_id,
      tournament_id,
      role,
      profiles:profiles!inner (
        email,
        display_name
      )
    `)
    .eq('tournament_id', id);

  console.log(error);
  console.log(members);

  const formattedMembers =
    members?.map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      tournament_id: m.tournament_id,
      role: m.role,
      email: m.profiles?.email ?? null,
      display_name: m.profiles?.display_name ?? null,
    })) ?? [];

  return (
    <MembersClient
      tournament={tournament}
      members={formattedMembers}
      currentUserId={user.id}
      currentRole={membership.role}
    />
  );
}