'use client';

/**
 * Signs the current user out and sends them to the login page. Used in More and
 * on the servant form, the one screen a roleless servant can reach.
 *
 * `link` is the small underlined style a `BoardHeader` action uses (the form's
 * Home link); the default is the full-width secondary button.
 */

import { useRouter } from 'next/navigation';

import { secondaryButtonClasses } from '@/components/cis/button';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton({ variant = 'button' }: { variant?: 'button' | 'link' }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className={
        variant === 'link'
          ? 'min-h-cis-tap-primary cursor-pointer border-0 bg-transparent p-0 text-cis-sm font-bold text-cis-action underline'
          : `${secondaryButtonClasses} w-full`
      }
    >
      Sign out
    </button>
  );
}
