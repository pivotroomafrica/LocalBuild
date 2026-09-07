import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getExpertApplicationData } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { SessionPricingForm } from "@/components/expert/SessionPricingForm";
import type { SessionDuration } from "@/types/expert";

export default async function ExpertApplicationSessionsPage() {
  await ensureExpertProfileDraft();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await getExpertApplicationData(supabase, user!.id);
  const expertProfile = data?.expertProfile;
  const offerings = data?.sessionOfferings ?? [];

  // Prefill strategy (existing Phase 2 demo/test data may predate this
  // pricing model): if base_hourly_price is already set, it's the
  // established source of truth -- use it and the durations/format
  // already saved under it. Otherwise, if an old-style 60-minute row
  // exists (manually created under the removed per-duration UI), use its
  // price/format as a starting point -- a reasonable bridge, not a
  // silent migration, since nothing is written until the applicant saves.
  // If neither exists, leave the form empty rather than guessing from
  // inconsistent duration/price combinations.
  let initialBasePrice: number | null = expertProfile?.base_hourly_price ?? null;
  let initialOnlineEnabled = expertProfile?.online_enabled ?? false;
  let initialInPersonEnabled = expertProfile?.in_person_enabled ?? false;
  let initialDurations: SessionDuration[] = offerings.map(
    (o) => o.duration_minutes as SessionDuration,
  );

  if (initialBasePrice == null) {
    const sixtyMinuteRow = offerings.find((o) => o.duration_minutes === 60);
    if (sixtyMinuteRow) {
      initialBasePrice = Number(sixtyMinuteRow.base_price);
      initialOnlineEnabled = sixtyMinuteRow.online_enabled;
      initialInPersonEnabled = sixtyMinuteRow.in_person_enabled;
    } else {
      initialDurations = [];
    }
  }

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/sessions" />
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            Session Pricing
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Set your 60-minute rate and choose which session lengths you want to offer.
            Pivotroom will automatically calculate prices for shorter and longer sessions.
          </p>
        </div>

        <SessionPricingForm
          initialBasePrice={initialBasePrice}
          initialDurations={initialDurations}
          initialOnlineEnabled={initialOnlineEnabled}
          initialInPersonEnabled={initialInPersonEnabled}
        />
      </div>
    </div>
  );
}
