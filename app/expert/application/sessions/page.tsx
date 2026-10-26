import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getExpertApplicationData } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { SessionPricingForm } from "@/components/expert/SessionPricingForm";
import { fetchPlatformPricing } from "@/lib/pricing/platform";
import type { SessionDuration } from "@/types/expert";

export default async function ExpertApplicationSessionsPage() {
  await ensureExpertProfileDraft();

  const supabase = await createClient();
  const pricing = await fetchPlatformPricing(supabase);
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
      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="ws-h1">Sessions and hours</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Step 3 of 3, about 2 minutes. You can change your price and session lengths later. After approval
            you&apos;ll set the hours clients can book.
          </p>
        </div>

        <SessionPricingForm
          initialBasePrice={initialBasePrice}
          initialDurations={initialDurations}
          initialOnlineEnabled={initialOnlineEnabled}
          initialInPersonEnabled={initialInPersonEnabled}
          initialResponseTime={expertProfile?.response_time ?? null}
          pricing={pricing}
        />
      </div>
    </div>
  );
}
