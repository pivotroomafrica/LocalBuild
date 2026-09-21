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
} from "./data";
import {
  bookingConfirmationCustomerEmail,
  bookingConfirmationExpertEmail,
  paymentRejectedEmail,
  sessionReminderCustomerEmail,
  sessionReminderExpertEmail,
} from "./emailTemplates";

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

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
