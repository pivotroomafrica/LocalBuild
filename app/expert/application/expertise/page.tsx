import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getActiveExpertCategories, getExpertApplicationData } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { CategoryPicker } from "@/components/expert/CategoryPicker";

export default async function ExpertApplicationExpertisePage() {
  await ensureExpertProfileDraft();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [categories, data] = await Promise.all([
    getActiveExpertCategories(supabase),
    getExpertApplicationData(supabase, user!.id),
  ]);

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/expertise" />
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">
            Expertise Categories
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Choose the categories that best describe what you can advise on.
          </p>
        </div>
        <CategoryPicker categories={categories} selectedIds={data?.categoryIds ?? []} />
      </div>
    </div>
  );
}
