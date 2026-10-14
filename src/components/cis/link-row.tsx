/**
 * A ruled row that links somewhere, with a chevron: "Final places", "Bracket".
 * The heavy rule above and the hairline below stand in for a card border (§6).
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/cis/icon';

export function LinkRow({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="mb-4 flex min-h-[56px] items-center justify-between gap-2.5 border-b border-cis-rule border-t-[5px] border-t-cis-ink-dark px-1 text-cis-ink"
    >
      <span>
        <span className="block text-cis-md font-extrabold">{title}</span>
        {children ? <span className="block text-cis-sm font-bold text-cis-ink-muted">{children}</span> : null}
      </span>
      <span className="text-cis-orange-text">
        <Icon name="chevron-right" />
      </span>
    </Link>
  );
}
