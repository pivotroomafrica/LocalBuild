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
  const applicationStatus = expertProfile.application_status;
  const profileStatus = expertProfile.profile_status;
  const isSubmitted = applicationStatus === "submitted";

  // Single source of truth for completeness -- the same checklist items
  // that gate submission server-side (getMissingRequiredFields), grouped
  // by section. The checklist below and the primary CTA can never
  // disagree, because both read from this one call.
  const sections = getSectionCompletion(data);
  const sectionRows: { label: string; complete: boolean }[] = [
    { label: "Profile", complete: sections.profile },
    { label: "Expertise", complete: sections.expertise },
    { label: "Session Pricing", complete: sections.sessions },
  ];

  const statusLabel: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    changes_requested: "Changes Requested",
    approved: profileStatus === "published" ? "Published" : "Approved",
    rejected: "Rejected",
  };
  const displayStatus =
    profileStatus === "suspended" ? "Suspended" : statusLabel[applicationStatus] ?? applicationStatus;

  // Human-readable summary of the pricing configuration -- not internal
  // database rows, per spec section 15.
  const baseRateLabel =
    expertProfile.base_hourly_price != null
      ? `${Number(expertProfile.base_hourly_price).toLocaleString()} ETB`
      : "Not set";
  const durationsLabel =
    data.sessionOfferings.length > 0
      ? `${data.sessionOfferings
          .map((o) => o.duration_minutes)
          .sort((a, b) => a - b)
          .join(", ")} minutes`
      : "None selected";
  const formatLabel =
    [expertProfile.online_enabled ? "Online" : null, expertProfile.in_person_enabled ? "In Person" : null]
      .filter(Boolean)
      .join(" + ") || "Not set";

  // Priority order: every post-submission lifecycle state (submitted,
  // changes_requested, approved, published, rejected, suspended) shows
  // its own fixed status panel regardless of section completeness --
  // those states are admin-controlled, not something finishing a section
  // changes. Only in the pre-submission "draft" state does the
  // first-incomplete-section / submit flow apply.
  const primaryCta =
    applicationStatus === "submitted"
      ? ({ kind: "submitted" } as const)
      : applicationStatus === "changes_requested"
        ? ({ kind: "changes_requested" } as const)
        : applicationStatus === "rejected"
          ? ({ kind: "rejected" } as const)
          : applicationStatus === "approved" && profileStatus === "suspended"
            ? ({ kind: "suspended" } as const)
            : applicationStatus === "approved" && profileStatus === "published"
              ? ({ kind: "published" } as const)
              : applicationStatus === "approved"
                ? ({ kind: "approved" } as const)
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
            Status: <span className="font-medium">{displayStatus}</span>
            {expertProfile.submitted_at && (isSubmitted || applicationStatus === "changes_requested")
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
            <h2 className="text-sm font-semibold">Session Pricing</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {baseRateLabel} · {durationsLabel} · {formatLabel}
            </p>
            {expertProfile.base_hourly_price != null ? (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Prices shown are base session prices. Applicable government taxes are
                calculated separately.
              </p>
            ) : null}
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
          ) : primaryCta.kind === "changes_requested" ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
                <p className="font-medium">Changes Requested</p>
                <p className="mt-1">
                  {expertProfile.review_message ??
                    "An admin has requested changes to your application. Please review and update it below."}
                </p>
              </div>
              <SubmitApplicationPanel
                canSubmit
                label="Resubmit Application"
                successMessage="Application resubmitted. It's back in the review queue."
              />
            </div>
          ) : primaryCta.kind === "rejected" ? (
            <div className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
              <p className="font-medium">Application Not Approved</p>
              <p className="mt-1">
                {expertProfile.review_message ?? "Your application was not approved at this time."}
              </p>
            </div>
          ) : primaryCta.kind === "approved" ? (
            <div className="rounded-md bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success)]">
              <p className="font-medium">Application Approved</p>
              <p className="mt-1">
                Your application has been approved. An admin will publish your profile soon.
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <Link href="/expert/application/preview" className="inline-block font-medium underline">
                  Preview your public profile
                </Link>
                <Link href="/expert/availability" className="inline-block font-medium underline">
                  Set Availability
                </Link>
              </div>
            </div>
          ) : primaryCta.kind === "published" ? (
            <div className="rounded-md bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success)]">
              <p className="font-medium">Your Profile Is Live</p>
              <p className="mt-1">Customers can now find and view your expert profile.</p>
              <div className="mt-2 flex flex-col gap-1">
                <Link href={`/experts/${expertProfile.slug}`} className="inline-block font-medium underline">
                  View your public profile
                </Link>
                <Link href="/expert/availability" className="inline-block font-medium underline">
                  Manage Availability
                </Link>
              </div>
            </div>
          ) : primaryCta.kind === "suspended" ? (
            <div className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
              <p className="font-medium">Profile Suspended</p>
              <p className="mt-1">
                Your profile is temporarily suspended and is not visible in the public directory.
              </p>
              <Link href="/expert/availability" className="mt-2 inline-block font-medium underline">
                Manage Availability
              </Link>
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
