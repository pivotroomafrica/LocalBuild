import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getCustomerSessionDetail } from "@/lib/dashboard/data";
import { getOwnReviewForBooking, isReviewable } from "@/lib/reviews/data";
import { formatSessionDateTime } from "@/lib/dashboard/presentation";
import { initialsOf } from "@/components/site/format";
import { ReviewForm } from "@/components/session/ReviewForm";

/** Leave a review for one of the customer's own sessions, once it has
 * taken place. The database re-checks every rule (submit_expert_review). */
export default async function LeaveReviewPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, `/dashboard/sessions/${reference}/review`);

  const detail = await getCustomerSessionDetail(supabase, userId, reference);
  if (!detail) notFound();

  const { booking } = detail;
  const existing = await getOwnReviewForBooking(supabase, booking.id);

  return (
    <div className="pr" style={{ background: "transparent" }}>
      <div className="pcard stack" style={{ maxWidth: 680, marginInline: "auto", gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            className="initials"
            aria-hidden="true"
            style={{ width: 56, height: 56, borderRadius: 999, background: "#d5d8dd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flex: "none" }}
          >
            {initialsOf(detail.expertName)}
          </span>
          <span className="stack" style={{ lineHeight: 1.35 }}>
            <span className="muted" style={{ fontSize: 14 }}>
              Your session with
            </span>
            <span className="d" style={{ fontSize: 19 }}>
              {detail.expertName}
            </span>
            <span className="muted num" style={{ fontSize: 14 }}>
              {formatSessionDateTime(booking.start_at, booking.customer_timezone)} · {booking.duration_minutes} min
            </span>
          </span>
        </div>

        {existing ? (
          <div className="stack" style={{ gap: 12 }}>
            <h1 className="d" style={{ margin: 0, fontSize: 28 }}>
              You&apos;ve reviewed this session
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              {existing.rating} out of 5 · &ldquo;{existing.body}&rdquo;
            </p>
            <Link href={`/dashboard/sessions/${reference}`}>Back to the session</Link>
          </div>
        ) : !isReviewable(booking) ? (
          <div className="stack" style={{ gap: 12 }}>
            <h1 className="d" style={{ margin: 0, fontSize: 28 }}>
              You can review this session once it has taken place
            </h1>
            <Link href={`/dashboard/sessions/${reference}`}>Back to the session</Link>
          </div>
        ) : (
          <ReviewForm bookingReference={reference} expertName={detail.expertName} expertSlug={detail.expertSlug} />
        )}
      </div>
    </div>
  );
}
