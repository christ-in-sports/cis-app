'use client';

/**
 * `PhotoPicker` and `PhotoField`: choosing a kid's photo (`DESIGN_SYSTEM.md` §7,
 * ENG-21 / ENG-24).
 *
 * `PhotoPicker` is one square that is the control. Empty, it holds a camera and
 * the words "Add a photo", and tapping it opens the file chooser. Once the kid
 * has a photo, the photo fills the square and a plain "Replace photo" button sits
 * under it. One target, no stretched button beside a thumbnail, and the words
 * stay on screen because an icon alone is not enough for everyone who registers
 * a kid.
 *
 * It takes the file a parent picks, shrinks and re-encodes it in the browser
 * (HEIC from an iPhone included, `preparePhoto`), uploads it as the signed-in
 * user (`uploadKidPhoto`) and hands the caller the uploaded path. It says what it
 * is doing while it works, because converting a HEIC can take a second or two on
 * a phone and a control that seems to do nothing gets tapped again.
 *
 * It does not attach the photo to a kid. The caller decides when: the parent
 * form sends the path with the registration, and the Admin roster and the
 * "on a team" screen attach it at once with `replaceKidPhoto`.
 *
 * `PhotoField` is the labelled field for a form. Nothing here is colour-coded: a
 * photo is neither a score nor a verse, so the only orange is the focus ring.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { FieldError } from '@/components/cis/form';
import { SecondaryButton } from '@/components/cis/button';
import { Icon } from '@/components/cis/icon';
import { KidAvatar } from '@/components/cis/kid-avatar';
import { PhotoError, preparePhoto } from '@/lib/photo/prepare';
import type { KidPhoto } from '@/lib/photo/types';
import { uploadKidPhoto } from '@/lib/photo/upload';
import { cn } from '@/lib/utils';

/** A photo that is uploaded and waiting to be attached to a kid. */
export interface UploadedPhoto {
  /** The object path in the `kid-photos` bucket: what the server is sent. */
  path: string;
  /** A link to the file on this device, for showing what was chosen. */
  previewUrl: string;
}

type Phase = 'idle' | 'preparing' | 'uploading' | 'saving';

const PHASE_LABEL: Record<Exclude<Phase, 'idle'>, string> = {
  preparing: 'Preparing photo…',
  uploading: 'Uploading photo…',
  saving: 'Saving photo…',
};

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-cis-orange';

export function PhotoPicker({
  firstName,
  lastName,
  photo,
  onUploaded,
  disabled,
  invalid,
  describedBy,
}: {
  firstName: string;
  lastName: string;
  /** What to show: the kid's photo, or what was just chosen. Null shows the empty square. */
  photo: KidPhoto | null;
  /** Called with the upload. May return a promise, which keeps the picker busy ("Saving photo…") until it settles. */
  onUploaded: (photo: UploadedPhoto) => void | Promise<void>;
  disabled?: boolean;
  /** The form's error for this field: the empty square takes the 3px danger outline. */
  invalid?: boolean;
  /** Ids of the hint and error, so a screen reader reads them with the control. */
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== 'idle';
  const open = () => input.current?.click();

  async function choose(file: File) {
    setError(null);
    setPhase('preparing');
    try {
      const prepared = await preparePhoto(file);
      setPhase('uploading');
      const path = await uploadKidPhoto(prepared);
      setPhase('saving');
      await onUploaded({ path, previewUrl: URL.createObjectURL(prepared.blob) });
    } catch (err) {
      // A PhotoError's message is written for the parent; anything else is not.
      setError(err instanceof PhotoError ? err.message : 'The photo could not be added. Try again.');
    } finally {
      setPhase('idle');
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-cis-2">
      <input
        ref={input}
        type="file"
        // `.heic` and `.heif` as well as `image/*`: a few browsers do not count
        // them as images, and iPhone photos are usually HEIC.
        accept="image/*,.heic,.heif"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so choosing the same file again, after a failure, still fires.
          e.target.value = '';
          if (file) void choose(file);
        }}
      />

      {photo ? (
        <>
          {/* The photo is also a target for a finger or a mouse, but it is hidden
              from the keyboard and from screen readers: "Replace photo" below is
              the one control they use, so there is not a second stop that says
              the same thing. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled || busy}
            onClick={open}
            className={cn('shrink-0 rounded-cis-chip disabled:opacity-60', focusRing)}
          >
            <KidAvatar size="lg" firstName={firstName} lastName={lastName} photo={photo} />
          </button>
          <SecondaryButton
            type="button"
            className="min-h-cis-tap-min px-4 text-cis-base"
            disabled={disabled || busy}
            onClick={open}
          >
            Replace photo
          </SecondaryButton>
        </>
      ) : (
        <button
          type="button"
          // Not `aria-invalid`: a button does not support it. The error is read
          // through `aria-describedby`, and `data-invalid` drives the outline
          // and lets the form find the first problem to focus.
          data-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
          disabled={disabled || busy}
          onClick={open}
          className={cn(
            'flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-1 px-2',
            'rounded-cis-chip border-2 border-cis-ink bg-cis-paper-light text-cis-ink',
            'data-[invalid=true]:border-[3px] data-[invalid=true]:border-cis-danger',
            'enabled:hover:bg-[rgba(36,31,28,.07)] disabled:opacity-60',
            focusRing,
          )}
        >
          <Icon name="camera" size={28} />
          <span className="text-cis-sm font-bold leading-[1.2]">Add a photo</span>
        </button>
      )}

      <p role="status" className="m-0 min-h-[1.4em] text-cis-sm font-semibold text-cis-ink-muted">
        {busy ? PHASE_LABEL[phase as Exclude<Phase, 'idle'>] : ''}
      </p>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function PhotoField({
  label = 'Photo',
  hint,
  firstName,
  lastName,
  current,
  value,
  onChange,
  error,
  disabled,
}: {
  label?: string;
  hint?: string;
  firstName: string;
  lastName: string;
  /** The photo the kid already has, if any. */
  current?: KidPhoto | null;
  /** The photo just uploaded in this form, if any. It wins over `current`. */
  value: UploadedPhoto | null;
  onChange: (photo: UploadedPhoto) => void;
  /** The form's own error for this field, such as "Add a photo of your kid". */
  error?: string;
  disabled?: boolean;
}) {
  // Local preview links are released when replaced or when the form closes.
  useEffect(() => {
    const url = value?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [value?.previewUrl]);

  const shown: KidPhoto | null = value
    ? { photoPath: value.path, signedUrl: value.previewUrl }
    : (current ?? null);

  // Not `Field`: its `<label for>` would become the control's name, so a screen
  // reader would say "Photo, button" and never "Add a photo". A labelled group
  // keeps the heading and lets the control name itself.
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
      <span id={labelId} className="text-cis-base font-bold leading-[1.3] text-cis-ink">
        {label}
      </span>
      {hint && (
        <p id={hintId} className="m-0 text-cis-sm font-semibold leading-[1.4] text-cis-ink-muted">
          {hint}
        </p>
      )}
      <PhotoPicker
        firstName={firstName}
        lastName={lastName}
        photo={shown}
        onUploaded={onChange}
        disabled={disabled}
        invalid={Boolean(error)}
        describedBy={describedBy || undefined}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
