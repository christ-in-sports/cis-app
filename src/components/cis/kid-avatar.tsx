'use client';

/**
 * `KidAvatar`: a kid's photo, or their initials where there is none
 * (`DESIGN_SYSTEM.md` §7, ENG-21 / ENG-24).
 *
 * A square with the 12px chip radius. Not a circle: the full pill is reserved
 * for buttons (§6), and a square crops a face with less guesswork. No border and
 * no tint that could be read as state: the initials tile is plain paper with ink
 * text, because colour here would suggest orange (present), ember (a score) or
 * sage (a verse), and a missing photo is none of those.
 *
 * The photo is decorative (`alt=""`): the kid's name is always next to it, and a
 * second reading of the name helps nobody.
 *
 * Signed links change on every page load (the attendance screens re-read the
 * roster every 10 seconds), and a browser treats a new link as a new image, so
 * left alone every photo would download again every refresh. So the avatar keeps
 * the first link it saw for a photo and ignores the fresh ones, until the photo
 * itself changes (a replacement has a new `photoPath`) or the kept link stops
 * working because it expired, when it switches to the newest one the page has.
 * If that fails too it falls back to initials. A plain `<img>`, not
 * `next/image`: the image optimizer would route every photo through Vercel,
 * which is the cost signed links exist to avoid.
 */

import { useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import type { KidPhoto } from '@/lib/photo/types';
import { cn } from '@/lib/utils';

const avatar = cva(
  'inline-flex shrink-0 select-none items-center justify-center overflow-hidden ' +
    'rounded-cis-chip bg-cis-paper font-cis-body font-bold leading-none text-cis-ink',
  {
    variants: {
      size: {
        /** A dense list, such as the roster table. */
        sm: 'h-10 w-10 text-cis-sm',
        /** An attendance row: big enough to recognise a face from a sideline. */
        md: 'h-14 w-14 text-cis-md',
        /** A kid's own page or form. */
        lg: 'h-28 w-28 text-cis-xl',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

/** "Mina Hanna" -> "MH". Never empty: a kid with no name on record shows a dash. */
export function initialsOf(firstName: string, lastName: string): string {
  const letters = [firstName, lastName]
    .map((name) => name.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join('');
  return letters || '—';
}

export function KidAvatar({
  firstName,
  lastName,
  photo,
  size,
  className,
}: VariantProps<typeof avatar> & {
  firstName: string;
  lastName: string;
  photo?: KidPhoto | null;
  className?: string;
}) {
  const path = photo?.photoPath ?? null;
  const latest = photo?.signedUrl ?? null;

  // The first link seen for this photo, and the link that failed to load.
  const [kept, setKept] = useState<{ path: string; url: string } | null>(null);
  const [broken, setBroken] = useState<string | null>(null);

  // Adjusting state while rendering, from the props that changed, as React
  // documents for derived state: no effect, no extra paint.
  if (path === null) {
    if (kept !== null) setKept(null);
  } else if (latest !== null && kept?.path !== path) {
    setKept({ path, url: latest });
  }

  const url = path !== null && kept?.path === path ? kept.url : latest;

  function handleError() {
    if (path !== null && latest !== null && latest !== url) {
      // The kept link has probably expired; the page has a newer one.
      setKept({ path, url: latest });
    } else if (url !== null) {
      setBroken(url);
    }
  }

  return (
    <span className={cn(avatar({ size }), className)}>
      {url !== null && broken !== url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage links, deliberately not routed through the image optimizer
        <img
          src={url}
          alt=""
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={handleError}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initialsOf(firstName, lastName)}</span>
      )}
    </span>
  );
}
