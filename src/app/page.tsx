import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { redirectIfRoleless } from '@/lib/auth/servant-gate';
import { getMyRoles } from '@/lib/auth/roles';
import HomeClient from './home-client';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // A new servant has no role yet; the registration form is all they can use.
  await redirectIfRoleless();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const { roles } = await getMyRoles();
  return <HomeClient displayName={profile?.display_name} canManageTeams={roles.has('admin') || roles.has('program')} />;
}
