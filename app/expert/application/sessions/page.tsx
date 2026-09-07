import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getExpertApplicationData } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { SessionOfferingRow } from "@/components/expert/SessionOfferingRow";
import { AddSessionForm } from "@/components/expert/AddSessionForm";

export default async function ExpertApplicationSessionsPage() {
  await ensureExpertProfileDraft();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await getExpertApplicationData(supabase, user!.id);
  const offerings = data?.sessionOfferings ?? [];

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/sessions" />
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            Session Offerings
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Set your base price for each session duration you want to offer. This is your
            base price only — platform fees are not part of Phase 2.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {offerings.map((offering) => (
            <SessionOfferingRow key={offering.id} offering={offering} />
          ))}
        </div>

        <AddSessionForm usedDurations={offerings.map((o) => o.duration_minutes)} />

        {/* Each offering above already saves immediately via its own
            Add/Edit/Remove action -- there is nothing left to persist
            here. This is the final step of the guided flow, so it reads
            as "Save & Review" and returns the applicant to the Overview
            page to check completion status and submit. */}
        <Link
          href="/expert/application"
          className="inline-flex w-full items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          Save &amp; Review
        </Link>
      </div>
    </div>
  );
}
