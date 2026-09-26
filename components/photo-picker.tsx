'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Camera } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Avatar } from '@/components/ui';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif)$/;

/**
 * Photo choice from the gallery, the files or the camera (the mobile browser offers the
 * choice itself because no `capture` attribute is forced), with an instant preview.
 */
export default function PhotoPicker({
  name,
  currentUrl,
  file,
  onChange,
  onError,
}: {
  name: string;
  currentUrl?: string | null;
  file: File | null;
  onChange: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const { copy } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function handleFile(next: File | null) {
    if (!next) return;
    if (next.type && !ACCEPTED.test(next.type)) {
      onError(copy.photo.invalidType);
      return;
    }
    if (next.size > MAX_AVATAR_BYTES) {
      onError(copy.photo.tooLarge);
      return;
    }
    onError('');
    onChange(next);
  }

  const shown = preview || currentUrl || null;

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => inputRef.current?.click()} className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-navy/30" aria-label={shown ? copy.photo.change : copy.photo.choose}>
        <Avatar name={name || '?'} url={shown} size={84} className="border border-navy/10" />
        <span className="absolute -bottom-1 end-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-marine text-white">
          <Camera size={15} />
        </span>
      </button>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border border-marine/80 px-3 py-1.5 text-sm font-semibold text-marine hover:bg-lightblue">
            {shown ? copy.photo.change : copy.photo.choose}
          </button>
          {file && (
            <button type="button" onClick={() => onChange(null)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-100">
              {copy.photo.remove}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">{copy.photo.hint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0] || null);
          event.target.value = '';
        }}
      />
    </div>
  );
}
