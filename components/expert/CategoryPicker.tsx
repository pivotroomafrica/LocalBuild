"use client";

import { useActionState, useState } from "react";
import { setExpertCategoriesAction, type ExpertActionState } from "@/lib/expert/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { MAX_EXPERT_CATEGORIES, type ExpertCategory } from "@/types/expert";

const initialState: ExpertActionState = {};

type Props = {
  categories: ExpertCategory[];
  selectedIds: string[];
};

export function CategoryPicker({ categories, selectedIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [state, formAction, isPending] = useActionState(setExpertCategoriesAction, initialState);

  const atLimit = selected.size >= MAX_EXPERT_CATEGORIES;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_EXPERT_CATEGORIES) {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <p className="text-sm text-[var(--color-text-muted)]">
        Select up to {MAX_EXPERT_CATEGORIES} categories ({selected.size}/{MAX_EXPERT_CATEGORIES} selected).
      </p>

      <div className="flex flex-col gap-2">
        {categories.map((category) => {
          const isChecked = selected.has(category.id);
          const isDisabled = !isChecked && atLimit;
          return (
            <label
              key={category.id}
              className={`flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm ${
                isDisabled ? "opacity-50" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                name="category_ids"
                value={category.id}
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => toggle(category.id)}
                className="h-4 w-4"
              />
              {category.name}
            </label>
          );
        })}
      </div>

      <Button type="submit" isLoading={isPending} loadingText="Saving...">
        Save &amp; Continue
      </Button>
    </form>
  );
}
