import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getExpertApplicationData, getCompletionChecklist } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { SubmitApplicationPanel } from "@/components/expert/SubmitApplicationPanel";

export default async function ExpertApplicationPage() {
  await ensureExpertProfileDraft();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await getExpertApplicationData(supabase, user!.id);
  if (!data) {
    return <p className="text-sm text-[var(--color-danger)]">We couldn&apos;t load your application. Please try again.</p>;
  }

  const { expertProfile } = data;
  const checklist = getCompletionChecklist(data);
  const allComplete = checklist.every((item) => item.complete);
  const isSubmitted = expertProfile.application_status === "submitted";

  return (
    <div>
      <ExpertApplicationNav current="/expert/application" />

      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            Expert Application
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Status:{" "}
            <span className="font-medium">
              {isSubmitted ? "Submitted" : "Draft"}
            </span>
            {isSubmitted && expertProfile.submitted_at
              ? ` — ${new Date(expertProfile.submitted_at).toLocaleDateString()}`
              : ""}
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/expert/application/profile"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)]"
          >
            <h2 className="text-sm font-semibold">Professional Profile</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Headline, experience, bio, photo
            </p>
          </Link>
          <Link
            href="/expert/application/expertise"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)]"
          >
            <h2 className="text-sm font-semibold">Expertise Categories</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {data.categoryIds.length} of 3 selected
            </p>
          </Link>
          <Link
            href="/expert/application/sessions"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)]"
          >
            <h2 className="text-sm font-semibold">Session Offerings</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {data.sessionOfferings.length} offering{data.sessionOfferings.length === 1 ? "" : "s"}
            </p>
          </Link>
        </section>

        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Application Completion</h2>
          <ul className="flex flex-col gap-1.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    item.complete ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"
                  }
                  aria-hidden
                >
                  {item.complete ? "✓" : "○"}
                </span>
                <span className={item.complete ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {isSubmitted ? (
          <div className="rounded-md bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success)]">
            Your application is submitted and ready for review. You can keep editing any
            section above — your changes are saved, and your application stays submitted.
          </div>
        ) : (
          <section>
            {!allComplete ? (
              <p className="mb-3 text-sm text-[var(--color-text-muted)]">
                Complete every item above before submitting.
              </p>
            ) : null}
            <SubmitApplicationPanel canSubmit={allComplete} />
          </section>
        )}
      </div>
    </div>
  );
}
