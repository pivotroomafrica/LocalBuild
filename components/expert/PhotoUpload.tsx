"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PhotoCropper } from "@/components/expert/PhotoCropper";
import { uploadExpertPhotoAction, type ExpertActionState } from "@/lib/expert/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: ExpertActionState = {};

export function PhotoUpload({ currentPhotoUrl }: { currentPhotoUrl: string | null }) {
  const [state, formAction, isPending] = useActionState(uploadExpertPhotoAction, initialState);
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) setPicked(file);
  }

  function cancelCrop() {
    setPicked(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Put the cropped photo in the file input and upload it straight away.
  function applyCropped(cropped: File) {
    const input = inputRef.current;
    setPicked(null);
    if (!input) return;
    const transfer = new DataTransfer();
    transfer.items.add(cropped);
    input.files = transfer.files;
    setPreview(URL.createObjectURL(cropped));
    formRef.current?.requestSubmit();
  }

  const shown = preview ?? currentPhotoUrl;

  return (
    <div className="flex items-center gap-4">
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URL or local preview
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-xs text-[var(--color-text-muted)]">
            No photo
          </div>
        )}
      </div>

      <form ref={formRef} action={formAction} className="flex flex-1 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          name="photo"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          required
          onChange={handleChange}
          className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-full file:border file:border-[var(--color-border)] file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <p className="text-xs text-[var(--color-text-muted)]">
          JPG, PNG or WebP. After choosing, you can move, zoom and rotate it to frame your face.
        </p>
        {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
        {state.success && !isPending ? <FormMessage variant="success">Photo updated.</FormMessage> : null}
        {isPending ? <p className="text-sm text-[var(--color-text-muted)]">Uploading…</p> : null}
        {shown && !isPending ? (
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} className="sm:w-auto">
            Choose a different photo
          </Button>
        ) : null}
      </form>

      {picked ? <PhotoCropper file={picked} onCancel={cancelCrop} onDone={applyCropped} /> : null}
    </div>
  );
}
