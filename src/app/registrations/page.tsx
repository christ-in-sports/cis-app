import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RegistrationsClient from './registrations-client';

export default async function RegistrationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/registrations');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_staff')
    .eq('id', user.id)
    .single();

  const isStaff = !!profile?.is_staff;

  const { data: registrations } = await supabase
    .from('registrations')
    .select('*')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  return (
    <RegistrationsClient
      initial={registrations ?? []}
      isStaff={isStaff}
    />
  );
}