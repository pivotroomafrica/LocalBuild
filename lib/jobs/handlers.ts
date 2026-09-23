import { getEmailProvider } from "@/lib/email/factory";
import { getCalendarProvider } from "@/lib/calendar/factory";
import { getAppUrl } from "./config";
import {
  type IntegrationJobRow,
  getNotificationContext,
  getBookingCalendarState,
  markCalendarSynced,
  markCalendarFailed,
  getPaymentRejectionContext,
  getRescheduleContext,
  getCancellationContext,
  getPendingChangeRequestContext,
} from "./data";
import {
  bookingConfirmationCustomerEmail,
  bookingConfirmationExpertEmail,
  paymentRejectedEmail,
  sessionReminderCustomerEmail,
  sessionReminderExpertEmail,
  sessionRescheduledCustomerEmail,
  sessionRescheduledExpertEmail,
  sessionCancelledCustomerEmail,
  sessionCancelledExpertEmail,
  expertRescheduleRequestedEmail,
} from "./emailTemplates";

/** Job dedupe_key is always "<prefix>:<uuid>" for the Phase 10 per-event
 * job types (calendar_update, calendar_cancel, reschedule_email_*,
 * cancellation_email_*) -- the uuid is the booking_reschedules/
 * booking_cancellations row id this specific job renders, so a booking
 * rescheduled or cancelled more than once always resolves the CORRECT
 * historical event, never just "whatever happened most recently". */
function parseEventIdFromDedupeKey(dedupeKey: string): string | null {
  const idx = dedupeKey.indexOf(":");
  if (idx === -1) return null;
  return dedupeKey.slice(idx + 1) || null;
}

export type JobHandlerResult = { ok: true; providerId: string | null } | { ok: false; error: string };

/**
 * One handler per job_type (spec section 4: one booking-confirmation
 * lifecycle, so every entry point -- manual verify, Chapa finalize --
 * lands on this exact same set of handlers, never a duplicated
 * per-provider implementation). Each handler resolves everything it
 * needs server-side (never trusts the job row's own payload for
 * anything beyond the reminder offset) and is safe to run more than
 * once for the same job (the worker's own claim step is what prevents
 * that in practice, but nothing here corrupts state if it somehow did).
 */
export async function runJobHandler(job: IntegrationJobRow): Promise<JobHandlerResult> {
  switch (job.job_type) {
    case "booking_confirmation_email_customer":
      return handleBookingConfirmationEmailCustomer(job);
    case "booking_confirmation_email_expert":
      return handleBookingConfirmationEmailExpert(job);
    case "calendar_create":
      return handleCalendarCreate(job);
    case "session_reminder_customer":
      return handleSessionReminderCustomer(job);
    case "session_reminder_expert":
      return handleSessionReminderExpert(job);
    case "payment_rejected_email":
      return handlePaymentRejectedEmail(job);
    case "calendar_update":
      return handleCalendarUpdate(job);
    case "calendar_cancel":
      return handleCalendarCancel(job);
    case "reschedule_email_customer":
      return handleRescheduleEmailCustomer(job);
    case "reschedule_email_expert":
      return handleRescheduleEmailExpert(job);
    case "cancellation_email_customer":
      return handleCancellationEmailCustomer(job);
    case "cancellation_email_expert":
      return handleCancellationEmailExpert(job);
    case "reschedule_request_email_customer":
      return handleRescheduleRequestEmailCustomer(job);
    default:
      return { ok: false, error: `Unknown job_type: ${job.job_type}` };
  }
}

async function handleBookingConfirmationEmailCustomer(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const ctx = await getNotificationContext(job.booking_id);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  const calendarState = await getBookingCalendarState(job.booking_id);

  const content = bookingConfirmationCustomerEmail({
    expertName: ctx.expert_full_name,
    startAt: ctx.start_at,
    customerTimezone: ctx.customer_timezone,
    durationMinutes: ctx.duration_minutes,
    sessionFormat: ctx.session_format,
    bookingReference: ctx.booking_reference,
    meetingUrl: calendarState?.calendar_meeting_url ?? null,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.customer_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

async function handleBookingConfirmationEmailExpert(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const ctx = await getNotificationContext(job.booking_id);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  const calendarState = await getBookingCalendarState(job.booking_id);

  const content = bookingConfirmationExpertEmail({
    customerName: ctx.customer_full_name,
    startAt: ctx.start_at,
    expertTimezone: ctx.expert_timezone,
    durationMinutes: ctx.duration_minutes,
    sessionFormat: ctx.session_format,
    bookingReference: ctx.booking_reference,
    meetingUrl: calendarState?.calendar_meeting_url ?? null,
    discussionTopic: ctx.discussion_topic,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.expert_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

async function handleCalendarCreate(job: IntegrationJobRow): Promise<JobHandlerResult> {
  // Idempotency (spec sections 45, 47): a booking that already has a
  // synced event never gets a second one, even if this job somehow runs
  // twice (e.g. it completed but the worker crashed before marking it
  // completed).
  const existing = await getBookingCalendarState(job.booking_id);
  if (existing?.calendar_event_id) {
    return { ok: true, providerId: existing.calendar_event_id };
  }

  const ctx = await getNotificationContext(job.booking_id);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };

  const wantsMeet = ctx.session_format === "online";
  const summary = `Pivotroom Session — ${truncate(ctx.expert_full_name, 40)} / ${truncate(ctx.customer_full_name, 40)}`;
  const description = [
    `Pivotroom booking reference: ${ctx.booking_reference}`,
    `Duration: ${ctx.duration_minutes} minutes`,
    `Format: ${ctx.session_format === "online" ? "Online" : "In person"}`,
    `Session link: ${getAppUrl()}/dashboard/sessions/${encodeURIComponent(ctx.booking_reference)}`,
  ].join("\n");

  const result = await getCalendarProvider().createEvent({
    bookingReference: ctx.booking_reference,
    startAt: ctx.start_at,
    endAt: ctx.end_at,
    summary,
    description,
    attendeeEmails: [ctx.customer_email, ctx.expert_email],
    wantsMeet,
  });

  if (!result.ok) {
    await markCalendarFailed(job.booking_id);
    return { ok: false, error: result.error };
  }

  await markCalendarSynced(job.booking_id, result.eventId, result.meetingUrl);
  return { ok: true, providerId: result.eventId };
}

async function handleSessionReminderCustomer(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const ctx = await getNotificationContext(job.booking_id);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  // Defense in depth (spec section 62): even though cancellation deletes
  // pending reminder jobs outright, a reminder already claimed/in-flight
  // when a cancellation lands concurrently must still refuse to send.
  if (ctx.booking_status !== "confirmed") {
    return { ok: true, providerId: null };
  }
  const calendarState = await getBookingCalendarState(job.booking_id);
  const offsetMinutes = typeof job.payload === "object" && job.payload && "offset_minutes" in job.payload
    ? Number((job.payload as { offset_minutes?: number }).offset_minutes)
    : 60;

  const content = sessionReminderCustomerEmail({
    expertName: ctx.expert_full_name,
    startAt: ctx.start_at,
    customerTimezone: ctx.customer_timezone,
    durationMinutes: ctx.duration_minutes,
    sessionFormat: ctx.session_format,
    bookingReference: ctx.booking_reference,
    meetingUrl: calendarState?.calendar_meeting_url ?? null,
    offsetMinutes,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.customer_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

async function handleSessionReminderExpert(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const ctx = await getNotificationContext(job.booking_id);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  if (ctx.booking_status !== "confirmed") {
    return { ok: true, providerId: null };
  }
  const calendarState = await getBookingCalendarState(job.booking_id);
  const offsetMinutes = typeof job.payload === "object" && job.payload && "offset_minutes" in job.payload
    ? Number((job.payload as { offset_minutes?: number }).offset_minutes)
    : 60;

  const content = sessionReminderExpertEmail({
    customerName: ctx.customer_full_name,
    startAt: ctx.start_at,
    expertTimezone: ctx.expert_timezone,
    durationMinutes: ctx.duration_minutes,
    sessionFormat: ctx.session_format,
    bookingReference: ctx.booking_reference,
    meetingUrl: calendarState?.calendar_meeting_url ?? null,
    discussionTopic: ctx.discussion_topic,
    offsetMinutes,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.expert_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

async function handlePaymentRejectedEmail(job: IntegrationJobRow): Promise<JobHandlerResult> {
  if (!job.payment_id) return { ok: false, error: "Job has no payment_id." };
  const ctx = await getPaymentRejectionContext(job.payment_id);
  if (!ctx) return { ok: false, error: "Payment rejection context not found." };

  const content = paymentRejectedEmail({
    customerFullName: ctx.customerFullName,
    bookingReference: ctx.bookingReference,
    rejectionReason: ctx.rejectionReason,
    holdExpiresAt: ctx.holdExpiresAt,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.customerEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

// =========================================================================
// Phase 10 -- reschedule side effects (spec sections 54-56, 60-65).
// =========================================================================

async function handleCalendarUpdate(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const calendarState = await getBookingCalendarState(job.booking_id);
  // No event exists yet for this booking (e.g. the original calendar_create
  // hasn't completed) -- nothing to update. Not an error: the reschedule
  // itself already succeeded in Pivotroom's own DB regardless of Calendar
  // state (spec section 56).
  if (!calendarState?.calendar_event_id) {
    return { ok: true, providerId: null };
  }

  const ctx = await getNotificationContext(job.booking_id);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };

  const result = await getCalendarProvider().updateEvent({
    eventId: calendarState.calendar_event_id,
    startAt: ctx.start_at,
    endAt: ctx.end_at,
  });

  if (!result.ok) {
    await markCalendarFailed(job.booking_id);
    return { ok: false, error: result.error };
  }

  return { ok: true, providerId: calendarState.calendar_event_id };
}

async function handleRescheduleEmailCustomer(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const rescheduleId = parseEventIdFromDedupeKey(job.dedupe_key);
  if (!rescheduleId) return { ok: false, error: "Malformed dedupe_key: missing reschedule id." };

  const [ctx, reschedule, calendarState] = await Promise.all([
    getNotificationContext(job.booking_id),
    getRescheduleContext(rescheduleId),
    getBookingCalendarState(job.booking_id),
  ]);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  if (!reschedule) return { ok: false, error: "Reschedule history record not found." };

  const content = sessionRescheduledCustomerEmail({
    expertName: ctx.expert_full_name,
    oldStartAt: reschedule.oldStartAt,
    newStartAt: reschedule.newStartAt,
    customerTimezone: ctx.customer_timezone,
    durationMinutes: ctx.duration_minutes,
    sessionFormat: ctx.session_format,
    bookingReference: ctx.booking_reference,
    meetingUrl: calendarState?.calendar_meeting_url ?? null,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.customer_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

async function handleRescheduleEmailExpert(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const rescheduleId = parseEventIdFromDedupeKey(job.dedupe_key);
  if (!rescheduleId) return { ok: false, error: "Malformed dedupe_key: missing reschedule id." };

  const [ctx, reschedule, calendarState] = await Promise.all([
    getNotificationContext(job.booking_id),
    getRescheduleContext(rescheduleId),
    getBookingCalendarState(job.booking_id),
  ]);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  if (!reschedule) return { ok: false, error: "Reschedule history record not found." };

  const content = sessionRescheduledExpertEmail({
    customerName: ctx.customer_full_name,
    oldStartAt: reschedule.oldStartAt,
    newStartAt: reschedule.newStartAt,
    expertTimezone: ctx.expert_timezone,
    durationMinutes: ctx.duration_minutes,
    sessionFormat: ctx.session_format,
    bookingReference: ctx.booking_reference,
    meetingUrl: calendarState?.calendar_meeting_url ?? null,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.expert_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

async function handleRescheduleRequestEmailCustomer(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const [ctx, request] = await Promise.all([
    getNotificationContext(job.booking_id),
    getPendingChangeRequestContext(job.booking_id),
  ]);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  // The customer may have already responded (accepted via their own
  // reschedule, or declined) by the time this job runs -- nothing left
  // to notify about, not an error (spec section 27's simpler-safe-version
  // never depends on this email arriving before a response).
  if (!request) return { ok: true, providerId: null };

  const content = expertRescheduleRequestedEmail({
    expertName: ctx.expert_full_name,
    startAt: ctx.start_at,
    customerTimezone: ctx.customer_timezone,
    bookingReference: ctx.booking_reference,
    reason: request.reason,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.customer_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

// =========================================================================
// Phase 10 -- cancellation side effects (spec sections 44-46, 57-59, 62).
// =========================================================================

async function handleCalendarCancel(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const calendarState = await getBookingCalendarState(job.booking_id);
  if (!calendarState?.calendar_event_id) {
    return { ok: true, providerId: null };
  }

  const result = await getCalendarProvider().cancelEvent({ eventId: calendarState.calendar_event_id });
  if (!result.ok) {
    await markCalendarFailed(job.booking_id);
    return { ok: false, error: result.error };
  }

  return { ok: true, providerId: calendarState.calendar_event_id };
}

async function handleCancellationEmailCustomer(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const cancellationId = parseEventIdFromDedupeKey(job.dedupe_key);
  if (!cancellationId) return { ok: false, error: "Malformed dedupe_key: missing cancellation id." };

  const [ctx, cancellation] = await Promise.all([
    getNotificationContext(job.booking_id),
    getCancellationContext(cancellationId),
  ]);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };
  if (!cancellation) return { ok: false, error: "Cancellation history record not found." };

  const content = sessionCancelledCustomerEmail({
    expertName: ctx.expert_full_name,
    startAt: ctx.start_at,
    customerTimezone: ctx.customer_timezone,
    bookingReference: ctx.booking_reference,
    financialFollowupRequired: cancellation.financialFollowupRequired,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.customer_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

async function handleCancellationEmailExpert(job: IntegrationJobRow): Promise<JobHandlerResult> {
  const cancellationId = parseEventIdFromDedupeKey(job.dedupe_key);
  if (!cancellationId) return { ok: false, error: "Malformed dedupe_key: missing cancellation id." };

  const ctx = await getNotificationContext(job.booking_id);
  if (!ctx) return { ok: false, error: "Booking notification context not found." };

  const content = sessionCancelledExpertEmail({
    customerName: ctx.customer_full_name,
    startAt: ctx.start_at,
    expertTimezone: ctx.expert_timezone,
    bookingReference: ctx.booking_reference,
    appUrl: getAppUrl(),
  });

  const result = await getEmailProvider().send({
    to: ctx.expert_email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: job.dedupe_key,
  });

  return result.ok ? { ok: true, providerId: result.providerId } : { ok: false, error: result.error };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
