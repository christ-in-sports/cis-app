'use client';

/**
 * A password (or secret code) box with a Show / Hide toggle, so a phone user
 * can check what they typed. The toggle is a text button, not an icon: a
 * labelled control needs no guessing, and `aria-pressed` tells a screen reader
 * whether the text is currently visible.
 */

import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={cn('pr-16', className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        className={cn(
          'absolute inset-y-0 right-0 flex min-w-14 items-center justify-center rounded-r-md px-3',
          'text-cis-sm font-bold text-cis-action',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cis-action',
        )}
      >
        {shown ? 'Hide' : 'Show'}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}
