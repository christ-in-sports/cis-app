'use client';

import { useRouter } from 'next/navigation';

import { secondaryButtonClasses } from '@/components/cis/button';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} className={`${secondaryButtonClasses} w-full`}>
      Sign out
    </button>
  );
}
