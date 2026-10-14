/**
 * The "Enter score" / "Edit score" link a scorer sees under a game on the
 * schedule and the bracket. Readers never get one: the page only renders it for
 * Admin and Program Team, and the screen it opens (and the database under it)
 * check the role again.
 */

import Link from 'next/link';

import { secondaryButtonClasses } from '@/components/cis/button';
import { Icon } from '@/components/cis/icon';

export function ScoreLink({ href, played, label }: { href: string; played: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-label={`${played ? 'Edit score' : 'Enter score'}: ${label}`}
      className={`${secondaryButtonClasses} mt-2.5 min-h-11 px-4 text-cis-base`}
    >
      <Icon name={played ? 'edit' : 'plus'} size={16} strokeWidth={3} />
      {played ? 'Edit score' : 'Enter score'}
    </Link>
  );
}
