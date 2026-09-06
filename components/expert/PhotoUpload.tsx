"use client";

import { useActionState } from "react";
import { uploadExpertPhotoAction, type ExpertActionState } from "@/lib/expert/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: ExpertActionState = {};

export function PhotoUpload({ currentPhotoUrl }: { currentPhotoUrl: string | null }) {
  const [state, formAction, isPending] = useActionState(uploadExpertPhotoAction, initialState);

  return (
    <div className="flex items-center gap-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)]">
        {currentPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL; not an optimizable static asset
          <img src={currentPhotoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-muted)]">
            No photo
          </div>
        )}
      </div>

      <form action={formAction} className="flex flex-1 flex-col gap-2">
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          required
          className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--color-border)] file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <p className="text-xs text-[var(--color-text-muted)]">JPG, PNG or WebP. Up to 3 MB.</p>
        {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
        {state.success ? <FormMessage variant="success">Photo updated.</FormMessage> : null}
        <Button type="submit" variant="secondary" isLoading={isPending} loadingText="Uploading...">
          Upload Photo
        </Button>
      </form>
    </div>
  );
}
