import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedExpertPage } from "@/lib/expert/auth";
import { getExpertSessionDetail } from "@/lib/expert/sessions";
import { formatExpertSessionDateTime } from "@/lib/expert/presentation";
import { BookingStatusPill } from "@/components/session/StatusPill";
import { ExpertSessionActionsPanel } from "@/components/expert/ExpertSessionActionsPanel";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { EXPERT_EXPERIENCE_RANGE_LABELS, type ExpertExperienceRange } from "@/types/expert";

/**
 * Expert-facing session detail (spec sections 24-31, 55). Ownership and
 * confirmed/completed status are enforced THREE ways: RLS
 * (bookings_select_own_expert + booking_intake_select_expert, both 039),
 * an explicit application-layer re-check inside getExpertSessionDetail
 * (booking.expert_profile_id === this expert's own expertProfileId AND
 * booking_status in ('confirmed','completed')), and get_customer_context_
 * for_booking()'s own internal re-validation for the customer projection
 * -- a booking that isn't this expert's, or hasn't reached
 * confirmed/completed, resolves to notFound() here exactly like a
 * reference that doesn't exist at all (spec section 52). This blocks the
 * expert's own held/awaiting_payment bookings from this page too, not
 * just the list, and also blocks a booking that only became reachable
 * through some OTHER permissive policy (e.g. this same account being the
 * CUSTOMER on it).
 *
 * Shows only what get_customer_context_for_booking() (039) returns --
 * name, role, employment type, company, industry, years of experience,
 * LinkedIn. Never email, phone, payment info, receipt, transaction
 * reference, or any other booking: those columns are never selected by
 * this page at all, not merely hidden in the UI.
 */
export default async function ExpertSessionDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase, `/expert/sessions/${reference}`);

  const detail = await getExpertSessionDetail(supabase, expertProfileId, reference);
  if (!detail) notFound();

  const { booking, intake, customer, rescheduleHistory, pendingChangeRequest } = detail;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/expert/sessions" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          &larr; Back to Sessions
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            {customer?.fullName ?? "Unknown"}
          </h1>
          <BookingStatusPill status={booking.booking_status as "confirmed" | "completed"} />
        </div>
      </div>

      {booking.booking_status === "confirmed" ? (
        <ExpertSessionActionsPanel
          bookingReference={booking.booking_reference}
          hasPendingRequest={pendingChangeRequest !== null}
        />
      ) : null}

      {rescheduleHistory.length > 0 ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Reschedule History</h2>
          <ul className="flex flex-col gap-3">
            {rescheduleHistory.map((reschedule) => (
              <li key={reschedule.id} className="rounded-md bg-[var(--color-bg)] p-3 text-sm">
                <p className="text-[var(--color-text)]">
                  {formatExpertSessionDateTime(reschedule.old_start_at, booking.expert_timezone)} &rarr;{" "}
                  {formatExpertSessionDateTime(reschedule.new_start_at, booking.expert_timezone)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  By {reschedule.actor_type}
                  {reschedule.reason ? ` — ${reschedule.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Session</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Date & time" value={formatExpertSessionDateTime(booking.start_at, booking.expert_timezone)} />
          <Field label="Duration" value={`${booking.duration_minutes} minutes`} />
          <Field
            label="Format"
            value={SESSION_FORMAT_LABELS[booking.session_format as "online" | "in_person"] ?? booking.session_format}
          />
          <Field label="Booking reference" value={booking.booking_reference} />
        </dl>
        <div className="mt-3 text-xs text-[var(--color-text-muted)]">
          {booking.session_format === "online" ? (
            booking.calendar_meeting_url ? (
              <a
                href={booking.calendar_meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[var(--color-brand)] hover:underline"
              >
                Join Google Meet
              </a>
            ) : (
              "Meeting details are being prepared."
            )
          ) : (
            "Meeting location will be provided separately."
          )}
        </div>
      </section>

      {customer ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">About the Customer</h2>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {customer.currentRole ? <Field label="Role" value={customer.currentRole} /> : null}
            {customer.companyName ? <Field label="Company" value={customer.companyName} /> : null}
            {customer.industryName ? <Field label="Industry" value={customer.industryName} /> : null}
            {customer.yearsExperienceRange ? (
              <Field
                label="Years of experience"
                value={
                  EXPERT_EXPERIENCE_RANGE_LABELS[customer.yearsExperienceRange as ExpertExperienceRange] ??
                  customer.yearsExperienceRange
                }
              />
            ) : null}
          </dl>
          {customer.linkedinUrl ? (
            <a
              href={customer.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-[var(--color-brand)] hover:underline"
            >
              View LinkedIn profile
            </a>
          ) : null}
        </section>
      ) : null}

      {intake ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">What They Want to Discuss</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <Field label="Discussion topic" value={intake.discussion_topic} block />
            <Field label="Additional context" value={intake.additional_context} block />
            {intake.materials_to_review ? (
              <Field label="Materials to review" value={intake.materials_to_review} block />
            ) : null}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value, block = false }: { label: string; value: string; block?: boolean }) {
  if (block) {
    return (
      <div>
        <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text)]">{value}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
