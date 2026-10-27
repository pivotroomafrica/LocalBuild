import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getCompletionChecklist, getExpertApplicationData, getSectionCompletion } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { SubmitApplicationPanel } from "@/components/expert/SubmitApplicationPanel";
import type { ApplicationSection } from "@/lib/expert/data";

const STEPS: { section: ApplicationSection; title: string; href: string }[] = [
  { section: "profile", title: "1. Who you are", href: "/expert/application/profile" },
  { section: "expertise", title: "2. What you've solved", href: "/expert/application/expertise" },
  { section: "sessions", title: "3. Sessions and hours", href: "/expert/application/sessions" },
];

export default async function ExpertApplicationPage() {
  const ensured = await ensureExpertProfileDraft();

  const supabase = await createClient();
  const data = await getExpertApplicationData(supabase, ensured.user_id, ensured);
  if (!data) {
    return (
      <p className="notice err" role="alert">
        We couldn&apos;t load your application. Please try again.
      </p>
    );
  }

  const { expertProfile } = data;
  const applicationStatus = expertProfile.application_status;
  const profileStatus = expertProfile.profile_status;

  // One source of truth for completeness: the same checklist gates
  // submission server-side (getMissingRequiredFields).
  const checklist = getCompletionChecklist(data);
  const sections = getSectionCompletion(data);
  const allComplete = sections.profile && sections.expertise && sections.sessions;
  const firstIncomplete = STEPS.find((step) => !sections[step.section]);
  const termsAccepted = expertProfile.terms_accepted_at != null;

  const pricingSummary =
    expertProfile.base_hourly_price != null
      ? `${Number(expertProfile.base_hourly_price).toLocaleString()} ETB for 60 minutes · ${
          data.sessionOfferings.length > 0
            ? `${data.sessionOfferings
                .map((o) => o.duration_minutes)
                .sort((a, b) => a - b)
                .join(", ")} min`
            : "no lengths chosen"
        } · ${
          [expertProfile.online_enabled ? "Online" : null, expertProfile.in_person_enabled ? "In person" : null]
            .filter(Boolean)
            .join(" + ") || "no format chosen"
        }`
      : null;

  return (
    <div>
      <ExpertApplicationNav current="/expert/application" />

      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="ws-h1">Review and submit</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Our team reads every application. Once approved, we check how your profile will look, then publish it on
            Pivotroom.
          </p>
        </div>

        <StatusNotice
          applicationStatus={applicationStatus}
          profileStatus={profileStatus}
          reviewMessage={expertProfile.review_message}
          slug={expertProfile.slug}
        />

        {STEPS.map((step) => {
          const missing = checklist.filter((item) => item.section === step.section && !item.complete);
          return (
            <section key={step.section} className="panel stack" style={{ gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h2 className="ws-h2">{step.title}</h2>
                <Link href={step.href} style={{ fontWeight: 500 }}>
                  Edit
                </Link>
              </div>
              {missing.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {step.section === "expertise"
                    ? `Complete · ${data.categoryIds.length} of 3 areas`
                    : step.section === "sessions" && pricingSummary
                      ? pricingSummary
                      : "Complete"}
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  <span className="muted">Still needed: </span>
                  {missing.map((item) => item.label).join(", ")}
                </p>
              )}
            </section>
          );
        })}

        <p style={{ margin: 0 }}>
          <Link href="/preview/my-profile">Preview how your profile will look</Link>
        </p>

        {applicationStatus === "draft" ? (
          firstIncomplete ? (
            <div className="oq-actions">
              <Link href={firstIncomplete.href} className="btn btn-ink md">
                Continue with {firstIncomplete.title.replace(/^\d\.\s/, "").toLowerCase()}
              </Link>
            </div>
          ) : (
            <SubmitApplicationPanel canSubmit={allComplete} termsAccepted={termsAccepted} />
          )
        ) : applicationStatus === "changes_requested" ? (
          <SubmitApplicationPanel
            canSubmit
            termsAccepted={termsAccepted}
            label="Resubmit for review"
            successMessage="Application resubmitted. It's back with our review team."
          />
        ) : null}
      </div>
    </div>
  );
}

function StatusNotice({
  applicationStatus,
  profileStatus,
  reviewMessage,
  slug,
}: {
  applicationStatus: string;
  profileStatus: string;
  reviewMessage: string | null;
  slug: string;
}) {
  if (applicationStatus === "submitted") {
    return (
      <p className="notice" style={{ margin: 0 }}>
        <strong>Submitted.</strong> Our team is reviewing your application. You can keep improving any step; your
        application stays submitted.
      </p>
    );
  }
  if (applicationStatus === "changes_requested") {
    return (
      <p className="notice err" style={{ margin: 0 }}>
        <strong>Changes requested.</strong>{" "}
        {reviewMessage ?? "Please update your application and resubmit it."}
      </p>
    );
  }
  if (applicationStatus === "rejected") {
    return (
      <p className="notice err" style={{ margin: 0 }}>
        <strong>Not approved.</strong> {reviewMessage ?? "Your application was not approved at this time."}
      </p>
    );
  }
  if (applicationStatus === "approved" && profileStatus === "suspended") {
    return (
      <p className="notice err" style={{ margin: 0 }}>
        <strong>Profile paused.</strong> Your profile is not visible to clients right now.{" "}
        <Link href="/expert/availability">Manage availability</Link>
      </p>
    );
  }
  if (applicationStatus === "approved" && profileStatus === "published") {
    return (
      <p className="notice" style={{ margin: 0 }}>
        <strong>Your profile is live.</strong> <Link href={`/experts/${slug}`}>View your public profile</Link> ·{" "}
        <Link href="/expert/availability">Manage availability</Link>
      </p>
    );
  }
  if (applicationStatus === "approved") {
    return (
      <p className="notice" style={{ margin: 0 }}>
        <strong>Approved.</strong> Our team is finishing your public profile and will publish it soon. Set your hours
        now so clients can book you from day one: <Link href="/expert/availability">Set availability</Link>
      </p>
    );
  }
  return null;
}
