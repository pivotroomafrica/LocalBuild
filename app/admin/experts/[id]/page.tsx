import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveExpertCategories,
  getExpertApplicationDataById,
  getExpertPhotoUrl,
  getMissingRequiredFields,
} from "@/lib/expert/data";
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
import { AdminExpertProfileEditor, AdminExpertVisibilityForm } from "@/components/admin/AdminExpertEditor";
import { APPLICATION_STATUS_LABELS, PROFILE_STATUS_LABELS } from "@/types/expert";
import { setReviewHiddenAction } from "@/lib/reviews/actions";

export default async function AdminExpertDetailPage({ params }: PageProps<"/admin/experts/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const data = await getExpertApplicationDataById(supabase, id);
  if (!data) {
    return (
      <p className="notice err" role="alert">
        Application not found.
      </p>
    );
  }

  const { expertProfile, categoryIds, sessionOfferings } = data;

  const [identity, photoUrl, allCategories, { data: reviews }] = await Promise.all([
    getApplicantIdentity(supabase, expertProfile.user_id),
    getExpertPhotoUrl(supabase, expertProfile.profile_image_path),
    getActiveExpertCategories(supabase),
    supabase
      .from("expert_reviews")
      .select("id, rating, body, is_hidden, created_at")
      .eq("expert_profile_id", expertProfile.id)
      .order("created_at", { ascending: false }),
  ]);

  const activeOfferings = sessionOfferings.filter((o) => o.is_active).sort((a, b) => a.duration_minutes - b.duration_minutes);
  const missing = getMissingRequiredFields(data);
  const hiddenCount = expertProfile.hidden_fields.length;
  const isPublished = expertProfile.application_status === "approved" && expertProfile.profile_status === "published";
  // Editing is most useful while reviewing; keep it folded once live.
  const openEditor = expertProfile.application_status === "submitted" || expertProfile.profile_status === "ready";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 6 }}>
        <Link href="/admin/experts" className="muted">
          &larr; Back to applications
        </Link>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URL
            <img src={photoUrl} alt="" width={64} height={64} style={{ borderRadius: 12, objectFit: "cover" }} />
          ) : null}
          <h1 className="ws-h1">{identity?.full_name ?? "Unknown applicant"}</h1>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Application:{" "}
          <strong>
            {APPLICATION_STATUS_LABELS[expertProfile.application_status as keyof typeof APPLICATION_STATUS_LABELS] ??
              expertProfile.application_status}
          </strong>
          {" · "}Profile:{" "}
          <strong>
            {PROFILE_STATUS_LABELS[expertProfile.profile_status as keyof typeof PROFILE_STATUS_LABELS] ??
              expertProfile.profile_status}
          </strong>
          {expertProfile.submitted_at ? ` · Submitted ${new Date(expertProfile.submitted_at).toLocaleDateString()}` : ""}
          {" · "}
          {expertProfile.terms_accepted_at
            ? `Accepted expert terms ${new Date(expertProfile.terms_accepted_at).toLocaleDateString()}`
            : "Expert terms not accepted yet"}
        </p>
      </div>

      <section className="panel stack" style={{ gap: 10 }}>
        <h2 className="ws-h2">Before this profile goes live</h2>
        <ol className="stack" style={{ gap: 6, margin: 0, paddingInlineStart: 20 }}>
          <li>
            Check and tidy the details below. {missing.length > 0 ? <span>Still missing: {missing.join(", ")}.</span> : "Everything required is filled in."}
          </li>
          <li>
            Choose what clients can see ({hiddenCount === 0 ? "everything is shown" : `${hiddenCount} hidden`}), then{" "}
            <Link href={`/admin/experts/${expertProfile.id}/preview`}>preview the profile</Link>.
          </li>
          <li>Approve the application.</li>
          <li>
            Publish. The profile then appears on{" "}
            {isPublished ? <Link href={`/experts/${expertProfile.slug}`}>/experts/{expertProfile.slug}</Link> : <span>/experts/{expertProfile.slug}</span>}
            , in the directory and in matching.
          </li>
        </ol>
      </section>

      <section className="panel stack" style={{ gap: 16 }}>
        <h2 className="ws-h2">Decision</h2>
        <ReviewActions
          expertProfileId={expertProfile.id}
          applicationStatus={expertProfile.application_status}
          profileStatus={expertProfile.profile_status}
        />
        {expertProfile.review_message &&
        (expertProfile.application_status === "changes_requested" || expertProfile.application_status === "rejected") ? (
          <p className="notice" style={{ margin: 0 }}>
            <strong>
              {expertProfile.application_status === "rejected" ? "Reason sent to applicant: " : "Changes requested: "}
            </strong>
            {expertProfile.review_message}
          </p>
        ) : null}
      </section>

      <section className="panel stack" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="ws-h2">What clients can see</h2>
          <p className="muted" style={{ margin: 0 }}>
            Untick anything that shouldn&apos;t appear on the public profile, the directory or in matching.
          </p>
        </div>
        <AdminExpertVisibilityForm expertProfileId={expertProfile.id} hiddenFields={expertProfile.hidden_fields} />
      </section>

      <details className="panel" open={openEditor}>
        <summary className="ws-h2" style={{ cursor: "pointer" }}>
          Profile details
        </summary>
        <p className="muted" style={{ margin: "8px 0 16px" }}>
          The expert&apos;s onboarding answers. Fix wording or typos here; the expert sees the same changes in their
          application.
        </p>
        <AdminExpertProfileEditor profile={expertProfile} categories={allCategories} selectedCategoryIds={categoryIds} />
      </details>

      <section className="panel stack" style={{ gap: 8 }}>
        <h2 className="ws-h2">Sessions</h2>
        {activeOfferings.length > 0 ? (
          <>
            <div className="rows">
              {activeOfferings.map((o) => (
                <div key={o.id} style={{ gridTemplateColumns: "110px minmax(0, 1fr)" }}>
                  <span className="num">{o.duration_minutes} min</span>
                  <span className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                    {Number(o.base_price).toLocaleString()} {o.currency}
                  </span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Format:{" "}
              {[expertProfile.online_enabled ? "Online" : null, expertProfile.in_person_enabled ? "In person" : null]
                .filter(Boolean)
                .join(" + ") || "Not set"}
              . Prices are before VAT; Pivotroom&apos;s commission is included.
            </p>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No session pricing yet.
          </p>
        )}
        {expertProfile.linkedin_url ? (
          <p style={{ margin: 0 }}>
            <a href={expertProfile.linkedin_url} target="_blank" rel="noreferrer">
              Open LinkedIn
            </a>
          </p>
        ) : null}
      </section>

      {reviews && reviews.length > 0 ? (
        <section className="panel stack" style={{ gap: 8 }}>
          <h2 className="ws-h2">Client reviews</h2>
          <div className="rows">
            {reviews.map((review) => (
              <div key={review.id} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    {review.rating} out of 5 · {new Date(review.created_at).toLocaleDateString()}
                    {review.is_hidden ? " · Hidden" : ""}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
                    {review.body}
                  </p>
                </div>
                <form action={setReviewHiddenAction}>
                  <input type="hidden" name="review_id" value={review.id} />
                  <input type="hidden" name="expert_profile_id" value={expertProfile.id} />
                  <input type="hidden" name="hidden" value={review.is_hidden ? "false" : "true"} />
                  <button type="submit" className="btn btn-line md">
                    {review.is_hidden ? "Show on profile" : "Hide from profile"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}
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
      <div className="stack" style={{ gap: 24 }}>
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
    return <p className="muted" style={{ margin: 0 }}>Waiting for the applicant to resubmit.</p>;
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
      <div className="oq-actions">
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
    return <p className="muted" style={{ margin: 0 }}>This application was rejected. Rejection is terminal.</p>;
  }

  return <p className="muted" style={{ margin: 0 }}>No actions available for this status.</p>;
}
