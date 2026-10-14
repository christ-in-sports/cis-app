'use client';

/**
 * The sheet every Manage form sits in: a heading, the fields, an error line, and
 * the opaque action bar at the bottom (Cancel, then the primary action). Keeps
 * the four forms the same shape so none of them carries its own bar.
 */

import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';

import { DangerButton, PrimaryButton, secondaryButtonClasses } from '@/components/cis/button';
import { FieldError } from '@/components/cis/form';
import { Sheet } from '@/components/cis/sheet';

export function FormFrame({
  children,
  error,
  backHref,
  submitLabel,
  pendingLabel,
  pending,
  disabled,
  danger,
  onSubmit,
}: {
  children: ReactNode;
  error: string | null;
  backHref: string;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  danger?: boolean;
  onSubmit: () => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending && !disabled) onSubmit();
  };
  const Button = danger ? DangerButton : PrimaryButton;
  return (
    <form onSubmit={submit} noValidate>
      <Sheet className="mx-3.5 mb-3.5 mt-1.5 px-[18px] pb-[22px] pt-5">
        {children}
        {error ? (
          <div className="pt-4">
            <FieldError>{error}</FieldError>
          </div>
        ) : null}
        <div className="-mx-[18px] -mb-[22px] mt-5 flex gap-2.5 border-t-[5px] border-cis-ink-dark px-3.5 pb-5 pt-3.5">
          <Link
            href={backHref}
            aria-disabled={pending}
            className={`${secondaryButtonClasses} px-5 text-cis-base ${pending ? 'pointer-events-none opacity-60' : ''}`}
          >
            Cancel
          </Link>
          <Button type="submit" className="flex-1" disabled={pending || disabled}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </Sheet>
    </form>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h2 className="border-b-[5px] border-cis-ink-dark pb-2 font-cis-display text-cis-lg font-normal leading-[1.15]">{title}</h2>
      <div className="flex flex-col gap-4 pt-3.5">{children}</div>
    </section>
  );
}
