import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getExpertApplicationDataById, getExpertPhotoUrl } from "@/lib/expert/data";
import { getApplicantIdentity } from "@/lib/admin/data";
import {
  approveApplicationAction,
  rejectApplicationAction,
  requestChangesAction,
  publishExpertAction,
  unpublishExpertAction,
  suspendExpertAction,
  restoreExpertAction,
} from "@/lib/admin/actions";
import { AdminActionButton } from "@/components/admin/AdminActionButton";
import { AdminMessageForm } from "@/components/admin/AdminMessageForm";
import {
  APPLICATION_STATUS_LABELS,
  PROFILE_STATUS_LABELS,
  EXPERT_EXPERIENCE_RANGE_LABELS,
  type ExpertExperienceRange,
} from "@/types/expert";

export default async function AdminExpertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const data = await getExpertApplicationDataById(supabase, id);
  if (!data) {
    return <p className="text-sm text-[var(--color-danger)]">Application not found.</p>;
  }

  const { expertProfile, categoryIds, sessionOfferings } = data;

  const [identity, photoUrl, { data: categories }] = await Promise.all([
    getApplicantIdentity(supabase, expertProfile.user_id),
    getExpertPhotoUrl(supabase, expertProfile.profile_image_path),
    supabase.from("expert_categories").select("id, name").in("id", categoryIds.length > 0 ? categoryIds : [""]),
  ]);

  const categoryNames = (categories ?? []).map((c) => c.name);
  const activeOfferings = sessionOfferings.filter((o) => o.is_active).sort((a, b) => a.duration_minutes - b.duration_minutes);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/experts" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          &larr; Back to applications
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          {identity?.full_name ?? "Unknown applicant"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Application: <span className="font-medium">{APPLICATION_STATUS_LABELS[expertProfile.application_status as keyof typeof APPLICATION_STATUS_LABELS] ?? expertProfile.application_status}</span>
          {" · "}
          Profile: <span className="font-medium">{PROFILE_STATUS_LABELS[expertProfile.profile_status as keyof typeof PROFILE_STATUS_LABELS] ?? expertProfile.profile_status}</span>
          {expertProfile.submitted_at ? ` · Submitted ${new Date(expertProfile.submitted_at).toLocaleDateString()}` : ""}
        </p>
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Professional Profile</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-bg)] text-xs text-[var(--color-text-muted)]">
              No photo
            </div>
          )}
          <dl className="grid flex-1 grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Field label="Headline" value={expertProfile.headline} />
            <Field label="Current position" value={expertProfile.current_position} />
            <Field label="Current company" value={expertProfile.current_company} />
            <Field
              label="Years of experience"
              value={
                expertProfile.years_experience_range
                  ? EXPERT_EXPERIENCE_RANGE_LABELS[expertProfile.years_experience_range as ExpertExperienceRange]
                  : null
              }
            />
            <Field label="Country / City" value={[expertProfile.country, expertProfile.city].filter(Boolean).join(", ") || null} />
            <Field label="LinkedIn" value={expertProfile.linkedin_url} />
          </dl>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Field label="Short bio" value={expertProfile.short_bio} block />
          <Field label="Expertise summary" value={expertProfile.expertise_summary} block />
          <Field label="Problems you help with" value={expertProfile.problems_help_with} block />
          <Field label="Who you help" value={expertProfile.who_i_help} block />
          <Field label="Career highlights" value={expertProfile.career_highlights} block />
        </div>
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Expertise Categories</h2>
        {categoryNames.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {categoryNames.map((name) => (
              <li key={name} className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)]">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">No categories selected.</p>
        )}
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Session Pricing</h2>
        {activeOfferings.length > 0 ? (
          <>
            <ul className="flex flex-col gap-1.5 text-sm">
              {activeOfferings.map((o) => (
                <li key={o.id} className="flex justify-between">
                  <span>{o.duration_minutes} min</span>
                  <span className="font-medium">
                    {Number(o.base_price).toLocaleString()} {o.currency}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Format: {[expertProfile.online_enabled ? "Online" : null, expertProfile.in_person_enabled ? "In Person" : null].filter(Boolean).join(" + ") || "Not set"}
            </p>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Displayed prices are base session prices. Applicable government taxes will be
              calculated separately.
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">No session pricing configured.</p>
        )}
      </section>

      {expertProfile.review_message && (expertProfile.application_status === "changes_requested" || expertProfile.application_status === "rejected") ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
            {expertProfile.application_status === "rejected" ? "Rejection reason sent to applicant" : "Changes requested from applicant"}
          </h2>
          <p className="text-sm text-[var(--color-text)]">{expertProfile.review_message}</p>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Review Decision</h2>
        <ReviewActions expertProfileId={expertProfile.id} applicationStatus={expertProfile.application_status} profileStatus={expertProfile.profile_status} />
      </section>
    </div>
  );
}

function Field({ label, value, block = false }: { label: string; value: string | null; block?: boolean }) {
  return (
    <div className={block ? "flex flex-col gap-1" : undefined}>
      <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
      <dd className={`text-sm text-[var(--color-text)] ${block ? "whitespace-pre-wrap" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

function ReviewActions({
  expertProfileId,
  applicationStatus,
  profileStatus,
}: {
  expertProfileId: string;
  applicationStatus: string;
  profileStatus: string;
}) {
  if (applicationStatus === "submitted") {
    return (
      <div className="flex flex-col gap-6">
        <AdminActionButton
          expertProfileId={expertProfileId}
          action={approveApplicationAction}
          label="Approve"
          loadingText="Approving..."
        />
        <AdminMessageForm
          expertProfileId={expertProfileId}
          action={requestChangesAction}
          label="Request Changes"
          loadingText="Sending..."
          placeholder="What does the applicant need to change?"
        />
        <AdminMessageForm
          expertProfileId={expertProfileId}
          action={rejectApplicationAction}
          label="Reject"
          loadingText="Rejecting..."
          placeholder="Why is this application being rejected?"
        />
      </div>
    );
  }

  if (applicationStatus === "changes_requested") {
    return <p className="text-sm text-[var(--color-text-muted)]">Waiting for the applicant to resubmit.</p>;
  }

  if (applicationStatus === "approved" && profileStatus === "ready") {
    return (
      <AdminActionButton
        expertProfileId={expertProfileId}
        action={publishExpertAction}
        label="Publish"
        loadingText="Publishing..."
      />
    );
  }

  if (applicationStatus === "approved" && profileStatus === "published") {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <AdminActionButton
          expertProfileId={expertProfileId}
          action={unpublishExpertAction}
          label="Unpublish"
          loadingText="Unpublishing..."
          variant="secondary"
        />
        <AdminActionButton
          expertProfileId={expertProfileId}
          action={suspendExpertAction}
          label="Suspend"
          loadingText="Suspending..."
          variant="secondary"
          confirm="Suspend this expert? Their profile will disappear from the public directory."
        />
      </div>
    );
  }

  if (applicationStatus === "approved" && profileStatus === "suspended") {
    return (
      <AdminActionButton
        expertProfileId={expertProfileId}
        action={restoreExpertAction}
        label="Restore to Ready"
        loadingText="Restoring..."
        variant="secondary"
      />
    );
  }

  if (applicationStatus === "rejected") {
    return <p className="text-sm text-[var(--color-text-muted)]">This application was rejected. Rejection is terminal.</p>;
  }

  return <p className="text-sm text-[var(--color-text-muted)]">No actions available for this status.</p>;
}
