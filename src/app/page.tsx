import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { redirectIfRoleless } from '@/lib/auth/servant-gate';
import HomeClient from './home-client';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // A new servant has no role yet; the registration form is all they can use.
  await redirectIfRoleless();

  return <HomeClient user={user} />;
}