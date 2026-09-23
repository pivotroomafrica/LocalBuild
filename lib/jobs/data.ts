import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";
import { INTEGRATION_MAX_ATTEMPTS } from "@/types/notifications";

export type IntegrationJobRow = Database["public"]["Tables"]["integration_jobs"]["Row"];
export type BookingNotificationContext =
  Database["public"]["Functions"]["get_booking_notification_context"]["Returns"][number];

const WORKER_BATCH_SIZE = 20;

/** Capped exponential-ish backoff (spec section 30): attempt 1 fails ->
 * retry in 1 min, attempt 2 -> 5 min, attempt 3 -> 30 min, attempt 4 ->
 * 2 hours, attempt 5 exhausts INTEGRATION_MAX_ATTEMPTS and the job is
 * marked failed instead of scheduled again. */
const BACKOFF_MINUTES = [1, 5, 30, 120];

/** Due jobs the worker should attempt this run -- pending and already
 * past their scheduled_for (immediate jobs are scheduled_for=now() at
 * registration time; reminders are scheduled_for=the future fire time). */
export async function getDueJobs(): Promise<IntegrationJobRow[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("integration_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(WORKER_BATCH_SIZE);
  return data ?? [];
}

/** Optimistic claim (spec section 9's "not dependent on a browser" +
 * general worker-safety): flips pending -> processing only if it is
 * still pending. Returns false if another concurrent worker run already
 * claimed it, so the caller skips it rather than double-processing. */
export async function claimJob(jobId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("integration_jobs")
    .update({ status: "processing", last_attempt_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("id");
  return (data?.length ?? 0) > 0;
}

export async function completeJob(jobId: string, providerId: string | null): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("integration_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      provider_id: providerId,
      last_error: null,
    })
    .eq("id", jobId);
}

/** Sanitized only (spec section 53) -- callers pass a short, already-safe
 * reason string (a provider's own message field or a generic fallback),
 * never a raw stack trace, auth header, or token. Truncated defensively
 * regardless. */
export async function failJobWithRetry(jobId: string, currentAttemptCount: number, reason: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const sanitized = reason.slice(0, 500);
  const nextAttempt = currentAttemptCount + 1;

  if (nextAttempt >= INTEGRATION_MAX_ATTEMPTS) {
    await supabase
      .from("integration_jobs")
      .update({ status: "failed", attempt_count: nextAttempt, last_error: sanitized })
      .eq("id", jobId);
    return;
  }

  const delayMinutes = BACKOFF_MINUTES[currentAttemptCount] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
  await supabase
    .from("integration_jobs")
    .update({
      status: "pending",
      attempt_count: nextAttempt,
      scheduled_for: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      last_error: sanitized,
    })
    .eq("id", jobId);
}

/** Everything an email/calendar handler needs for one booking, resolved
 * server-side (spec sections 54, 55) via the service-role-only
 * get_booking_notification_context() RPC (044) -- never a client-
 * supplied email. */
export async function getNotificationContext(bookingId: string): Promise<BookingNotificationContext | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.rpc("get_booking_notification_context", { p_booking_id: bookingId }).maybeSingle();
  return data ?? null;
}

export type BookingCalendarState = {
  calendar_event_id: string | null;
  calendar_meeting_url: string | null;
  calendar_sync_status: string;
};

export async function getBookingCalendarState(bookingId: string): Promise<BookingCalendarState | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("bookings")
    .select("calendar_event_id, calendar_meeting_url, calendar_sync_status")
    .eq("id", bookingId)
    .maybeSingle();
  return data ?? null;
}

export async function markCalendarSynced(bookingId: string, eventId: string, meetingUrl: string | null): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("bookings")
    .update({
      calendar_event_id: eventId,
      calendar_meeting_url: meetingUrl,
      calendar_sync_status: "synced",
      calendar_synced_at: new Date().toISOString(),
    })
    .eq("id", bookingId);
}

export async function markCalendarFailed(bookingId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("bookings").update({ calendar_sync_status: "failed" }).eq("id", bookingId);
}

export type RescheduleContext = {
  oldStartAt: string;
  oldEndAt: string;
  newStartAt: string;
  newEndAt: string;
  reason: string | null;
};

/** For calendar_update/reschedule_email_* jobs -- reads the exact
 * booking_reschedules row by id (parsed from the job's own dedupe_key,
 * e.g. "reschedule_email_customer:<reschedule_id>") so a booking
 * rescheduled more than once always renders the CORRECT old/new pair for
 * this specific reschedule event, never just "whatever is most recent". */
export async function getRescheduleContext(rescheduleId: string): Promise<RescheduleContext | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("booking_reschedules")
    .select("old_start_at, old_end_at, new_start_at, new_end_at, reason")
    .eq("id", rescheduleId)
    .maybeSingle();
  if (!data) return null;
  return {
    oldStartAt: data.old_start_at,
    oldEndAt: data.old_end_at,
    newStartAt: data.new_start_at,
    newEndAt: data.new_end_at,
    reason: data.reason,
  };
}

export type CancellationContext = {
  reason: string;
  financialFollowupRequired: boolean;
};

/** For calendar_cancel/cancellation_email_* jobs -- same "parse the id
 * out of dedupe_key" approach as getRescheduleContext(). */
export async function getCancellationContext(cancellationId: string): Promise<CancellationContext | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("booking_cancellations")
    .select("reason, financial_followup_required")
    .eq("id", cancellationId)
    .maybeSingle();
  if (!data) return null;
  return { reason: data.reason, financialFollowupRequired: data.financial_followup_required };
}

export type PendingChangeRequestContext = {
  reason: string;
};

/** For reschedule_request_email_customer -- the most recent PENDING
 * request for this booking (there can be at most one, enforced by the
 * partial unique index in 045). */
export async function getPendingChangeRequestContext(bookingId: string): Promise<PendingChangeRequestContext | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("booking_change_requests")
    .select("reason")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { reason: data.reason };
}

export type PaymentRejectionContext = {
  bookingReference: string;
  customerEmail: string;
  customerFullName: string;
  rejectionReason: string;
  holdExpiresAt: string | null;
};

/** For payment_rejected_email jobs -- resolves customer email the same
 * server-side way (never trusts a client-supplied address). */
export async function getPaymentRejectionContext(paymentId: string): Promise<PaymentRejectionContext | null> {
  const supabase = createServiceRoleClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("booking_id, customer_id, rejection_reason")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || !payment.rejection_reason) return null;

  const [{ data: booking }, { data: authUser }] = await Promise.all([
    supabase.from("bookings").select("booking_reference, hold_expires_at").eq("id", payment.booking_id).maybeSingle(),
    supabase.auth.admin.getUserById(payment.customer_id),
  ]);
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", payment.customer_id).maybeSingle();

  if (!booking || !authUser?.user?.email) return null;

  return {
    bookingReference: booking.booking_reference,
    customerEmail: authUser.user.email,
    customerFullName: profile?.full_name ?? "there",
    rejectionReason: payment.rejection_reason,
    holdExpiresAt: booking.hold_expires_at,
  };
}
