'use client';

/**
 * `PhotoPicker` and `PhotoField`: choosing a kid's photo (`DESIGN_SYSTEM.md` §7,
 * ENG-21 / ENG-24).
 *
 * `PhotoPicker` is the button. It takes the file a parent picks, shrinks and
 * re-encodes it in the browser (HEIC from an iPhone included, `preparePhoto`),
 * uploads it as the signed-in user (`uploadKidPhoto`) and hands the caller the
 * uploaded path. It says what it is doing while it works, because converting a
 * HEIC can take a second or two on a phone and a button that seems to do nothing
 * gets tapped again.
 *
 * It does not attach the photo to a kid. The caller decides when: the parent
 * form sends the path with the registration, and the Admin roster and the
 * "on a team" screen attach it at once with `replaceKidPhoto`.
 *
 * `PhotoField` is the labelled field for a form: the kid's avatar, large, so the
 * parent sees what was chosen, beside the picker. Nothing here is colour-coded:
 * a photo is neither a score nor a verse, so the only orange is the focus ring.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { FieldError, type FieldControlProps } from '@/components/cis/form';
import { SecondaryButton } from '@/components/cis/button';
import { KidAvatar } from '@/components/cis/kid-avatar';
import { PhotoError, preparePhoto } from '@/lib/photo/prepare';
import type { KidPhoto } from '@/lib/photo/types';
import { uploadKidPhoto } from '@/lib/photo/upload';

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

export function PhotoPicker({
  label,
  onUploaded,
  disabled,
  controlProps,
}: {
  /** The button's text: "Add a photo" or "Replace photo". */
  label: string;
  /** Called with the upload. May return a promise, which keeps the picker busy ("Saving photo…") until it settles. */
  onUploaded: (photo: UploadedPhoto) => void | Promise<void>;
  disabled?: boolean;
  /** The field's error wiring, so a screen reader hears it on the button. */
  controlProps?: Partial<FieldControlProps>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== 'idle';

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
    <div className="flex min-w-0 flex-1 flex-col gap-cis-2">
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
      <SecondaryButton
        type="button"
        {...controlProps}
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {label}
      </SecondaryButton>
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

  // Not `Field`: its `<label for>` would become the button's name, so a screen
  // reader would say "Photo, button" and never "Add a photo". A labelled group
  // keeps the heading and lets the button name itself.
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
      <div className="flex items-start gap-cis-3">
        <KidAvatar size="lg" firstName={firstName} lastName={lastName} photo={shown} />
        <PhotoPicker
          label={shown ? 'Replace photo' : 'Add a photo'}
          controlProps={{
            'aria-invalid': error ? true : undefined,
            'aria-describedby': describedBy || undefined,
          }}
          onUploaded={onChange}
          disabled={disabled}
        />
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
