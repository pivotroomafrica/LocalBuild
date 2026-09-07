import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getExpertApplicationData, getSectionCompletion } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { SubmitApplicationPanel } from "@/components/expert/SubmitApplicationPanel";

const PRIMARY_CTA_CLASSES =
  "inline-flex w-full items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]";

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
  const isSubmitted = expertProfile.application_status === "submitted";

  // Single source of truth for completeness -- the same checklist items
  // that gate submission server-side (getMissingRequiredFields), grouped
  // by section. The checklist below and the primary CTA can never
  // disagree, because both read from this one call.
  const sections = getSectionCompletion(data);
  const sectionRows: { label: string; complete: boolean }[] = [
    { label: "Profile", complete: sections.profile },
    { label: "Expertise", complete: sections.expertise },
    { label: "Sessions", complete: sections.sessions },
  ];

  // Priority order per spec: submitted is terminal (always show
  // "Application Submitted" regardless of section state, since editing
  // after submission is allowed but must never imply resubmission); the
  // first incomplete section in Profile -> Expertise -> Sessions order
  // otherwise; Submit Application only once every section is complete.
  const primaryCta = isSubmitted
    ? ({ kind: "submitted" } as const)
    : !sections.profile
      ? ({ kind: "continue", label: "Continue to Profile", href: "/expert/application/profile" } as const)
      : !sections.expertise
        ? ({ kind: "continue", label: "Continue to Expertise", href: "/expert/application/expertise" } as const)
        : !sections.sessions
          ? ({ kind: "continue", label: "Continue to Sessions", href: "/expert/application/sessions" } as const)
          : ({ kind: "submit" } as const);

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

        {/* Manual navigation into any section, in any order -- the
            Save & Continue buttons on each section are a recommended
            path, not the only path (spec section 7). */}
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
          <ul className="flex flex-col gap-2">
            {sectionRows.map((row) => (
              <li key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text)]">{row.label}</span>
                <span
                  className={
                    row.complete ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"
                  }
                >
                  {row.complete ? "Complete" : "Incomplete"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          {primaryCta.kind === "submitted" ? (
            <div className="rounded-md bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success)]">
              <p className="font-medium">Application Submitted</p>
              <p className="mt-1">
                Your application is ready for review. You can keep editing any section above —
                your changes are saved, and your application stays submitted.
              </p>
            </div>
          ) : primaryCta.kind === "continue" ? (
            <Link href={primaryCta.href} className={PRIMARY_CTA_CLASSES}>
              {primaryCta.label}
            </Link>
          ) : (
            <SubmitApplicationPanel canSubmit />
          )}
        </section>
      </div>
    </div>
  );
}
