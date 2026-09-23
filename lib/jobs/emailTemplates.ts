import { formatSessionDateTime } from "@/lib/dashboard/presentation";
import { SESSION_FORMAT_LABELS } from "@/types/booking";

export type EmailContent = { subject: string; html: string; text: string };

const BRAND_COLOR = "#14532d";

/** Shared, minimal, mobile-friendly layout (spec sections 63, 64) --
 * transactional first, no marketing banners. Table-based for email
 * client compatibility rather than modern CSS layout. */
function renderShell(params: {
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 0 24px;">
                <p style="margin:0 0 16px 0;font-size:13px;font-weight:700;letter-spacing:0.05em;color:${BRAND_COLOR};">PIVOTROOM</p>
                <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#1c1917;">${heading(params.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;font-size:14px;line-height:1.6;color:#44403c;">
                ${params.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <a href="${params.ctaUrl}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">${escapeHtml(params.ctaLabel)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;font-size:12px;color:#a8a29e;">Pivotroom.Africa</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function heading(text: string): string {
  return escapeHtml(text);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fieldRowHtml(label: string, value: string): string {
  return `<tr><td style="padding:4px 0;color:#78716c;">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#1c1917;">${escapeHtml(value)}</td></tr>`;
}

function fieldsTableHtml(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;font-size:14px;">${rows}</table>`;
}

function formatText(...lines: string[]): string {
  return lines.join("\n");
}

/** Same underlying reminder-offset numbers as
 * types/notifications.ts's SESSION_REMINDER_OFFSETS_MINUTES /
 * session_reminder_offsets_minutes() (044) -- a human label for the two
 * V1 offsets, not a general-purpose formatter. */
function offsetLabel(offsetMinutes: number): string {
  if (offsetMinutes >= 1440) return "tomorrow";
  return `in ${offsetMinutes} minutes`;
}

function meetingDetailsHtml(sessionFormat: string, meetingUrl: string | null): string {
  if (sessionFormat !== "online") {
    return `<p style="margin:12px 0 0 0;">Meeting location will be provided separately.</p>`;
  }
  if (meetingUrl) {
    return `<p style="margin:12px 0 0 0;"><a href="${meetingUrl}" style="color:${BRAND_COLOR};">Join Google Meet</a></p>`;
  }
  return `<p style="margin:12px 0 0 0;">Meeting details will be added before your session.</p>`;
}

// =========================================================================
// booking_confirmation_email_customer (spec section 14)
// =========================================================================
export function bookingConfirmationCustomerEmail(params: {
  expertName: string;
  startAt: string;
  customerTimezone: string | null;
  durationMinutes: number;
  sessionFormat: string;
  bookingReference: string;
  meetingUrl: string | null;
  appUrl: string;
}): EmailContent {
  const dateTime = formatSessionDateTime(params.startAt, params.customerTimezone);
  const formatLabel = SESSION_FORMAT_LABELS[params.sessionFormat as "online" | "in_person"] ?? params.sessionFormat;
  const ctaUrl = `${params.appUrl}/dashboard/sessions/${encodeURIComponent(params.bookingReference)}`;

  const html = renderShell({
    heading: "Your session is confirmed",
    bodyHtml: `
      <p style="margin:0;">Your payment has been verified and your session is confirmed.</p>
      ${fieldsTableHtml(
        fieldRowHtml("Expert", params.expertName) +
          fieldRowHtml("Date & time", dateTime) +
          fieldRowHtml("Duration", `${params.durationMinutes} minutes`) +
          fieldRowHtml("Format", formatLabel) +
          fieldRowHtml("Booking reference", params.bookingReference),
      )}
      ${meetingDetailsHtml(params.sessionFormat, params.meetingUrl)}
    `,
    ctaLabel: "View Session",
    ctaUrl,
  });

  const text = formatText(
    "Your Pivotroom session is confirmed",
    "",
    "Your payment has been verified and your session is confirmed.",
    "",
    `Expert: ${params.expertName}`,
    `Date & time: ${dateTime}`,
    `Duration: ${params.durationMinutes} minutes`,
    `Format: ${formatLabel}`,
    `Booking reference: ${params.bookingReference}`,
    "",
    params.sessionFormat === "online"
      ? params.meetingUrl
        ? `Join Google Meet: ${params.meetingUrl}`
        : "Meeting details will be added before your session."
      : "Meeting location will be provided separately.",
    "",
    `View your session: ${ctaUrl}`,
  );

  return { subject: "Your Pivotroom session is confirmed", html, text };
}

// =========================================================================
// booking_confirmation_email_expert (spec section 15) -- never payment
// details (spec section 15's own explicit rule).
// =========================================================================
export function bookingConfirmationExpertEmail(params: {
  customerName: string;
  startAt: string;
  expertTimezone: string | null;
  durationMinutes: number;
  sessionFormat: string;
  bookingReference: string;
  meetingUrl: string | null;
  discussionTopic: string | null;
  appUrl: string;
}): EmailContent {
  const dateTime = formatSessionDateTime(params.startAt, params.expertTimezone);
  const formatLabel = SESSION_FORMAT_LABELS[params.sessionFormat as "online" | "in_person"] ?? params.sessionFormat;
  const ctaUrl = `${params.appUrl}/expert/sessions/${encodeURIComponent(params.bookingReference)}`;
  const topicHtml = params.discussionTopic
    ? `<p style="margin:12px 0 0 0;"><strong>Discussion topic:</strong> ${escapeHtml(truncate(params.discussionTopic, 200))}</p>`
    : "";

  const html = renderShell({
    heading: "New confirmed session",
    bodyHtml: `
      <p style="margin:0;">You have a new confirmed Pivotroom session.</p>
      ${fieldsTableHtml(
        fieldRowHtml("Customer", params.customerName) +
          fieldRowHtml("Date & time", dateTime) +
          fieldRowHtml("Duration", `${params.durationMinutes} minutes`) +
          fieldRowHtml("Format", formatLabel) +
          fieldRowHtml("Booking reference", params.bookingReference),
      )}
      ${meetingDetailsHtml(params.sessionFormat, params.meetingUrl)}
      ${topicHtml}
    `,
    ctaLabel: "View Session",
    ctaUrl,
  });

  const text = formatText(
    "New confirmed Pivotroom session",
    "",
    `Customer: ${params.customerName}`,
    `Date & time: ${dateTime}`,
    `Duration: ${params.durationMinutes} minutes`,
    `Format: ${formatLabel}`,
    `Booking reference: ${params.bookingReference}`,
    "",
    params.sessionFormat === "online"
      ? params.meetingUrl
        ? `Join Google Meet: ${params.meetingUrl}`
        : "Meeting details will be added before the session."
      : "Meeting location will be provided separately.",
    params.discussionTopic ? `\nDiscussion topic: ${truncate(params.discussionTopic, 200)}` : "",
    "",
    `View session: ${ctaUrl}`,
  );

  return { subject: "New confirmed Pivotroom session", html, text };
}

// =========================================================================
// payment_rejected_email (spec sections 35, 83) -- only the customer-
// facing rejection reason, never internal admin notes.
// =========================================================================
export function paymentRejectedEmail(params: {
  customerFullName: string;
  bookingReference: string;
  rejectionReason: string;
  holdExpiresAt: string | null;
  appUrl: string;
}): EmailContent {
  const ctaUrl = `${params.appUrl}/booking/${encodeURIComponent(params.bookingReference)}/payment`;
  const deadlineHtml = params.holdExpiresAt
    ? fieldRowHtml("Respond by", new Date(params.holdExpiresAt).toLocaleString())
    : "";
  const deadlineText = params.holdExpiresAt ? `Respond by: ${new Date(params.holdExpiresAt).toLocaleString()}\n` : "";

  const html = renderShell({
    heading: "Payment needs attention",
    bodyHtml: `
      <p style="margin:0;">Hi ${escapeHtml(params.customerFullName)}, we couldn't verify your recent payment submission.</p>
      ${fieldsTableHtml(fieldRowHtml("Booking reference", params.bookingReference) + deadlineHtml)}
      <p style="margin:12px 0 0 0;"><strong>Reason:</strong> ${escapeHtml(params.rejectionReason)}</p>
    `,
    ctaLabel: "Go to Payment Page",
    ctaUrl,
  });

  const text = formatText(
    "Payment needs attention",
    "",
    `Hi ${params.customerFullName}, we couldn't verify your recent payment submission.`,
    "",
    `Booking reference: ${params.bookingReference}`,
    deadlineText,
    `Reason: ${params.rejectionReason}`,
    "",
    `Go to payment page: ${ctaUrl}`,
  );

  return { subject: "Payment needs attention", html, text };
}

// =========================================================================
// session_reminder_customer / session_reminder_expert (spec sections 40,
// 41) -- structurally identical to the confirmation emails minus the
// "payment verified" line, with an offset-aware subject line.
// =========================================================================
export function sessionReminderCustomerEmail(params: {
  expertName: string;
  startAt: string;
  customerTimezone: string | null;
  durationMinutes: number;
  sessionFormat: string;
  bookingReference: string;
  meetingUrl: string | null;
  offsetMinutes: number;
  appUrl: string;
}): EmailContent {
  const dateTime = formatSessionDateTime(params.startAt, params.customerTimezone);
  const formatLabel = SESSION_FORMAT_LABELS[params.sessionFormat as "online" | "in_person"] ?? params.sessionFormat;
  const ctaUrl = `${params.appUrl}/dashboard/sessions/${encodeURIComponent(params.bookingReference)}`;
  const subject = `Your Pivotroom session is coming up ${offsetLabel(params.offsetMinutes)}`;

  const html = renderShell({
    heading: "Your session is coming up",
    bodyHtml: `
      ${fieldsTableHtml(
        fieldRowHtml("Expert", params.expertName) +
          fieldRowHtml("Date & time", dateTime) +
          fieldRowHtml("Duration", `${params.durationMinutes} minutes`) +
          fieldRowHtml("Format", formatLabel),
      )}
      ${meetingDetailsHtml(params.sessionFormat, params.meetingUrl)}
    `,
    ctaLabel: "View Session",
    ctaUrl,
  });

  const text = formatText(
    subject,
    "",
    `Expert: ${params.expertName}`,
    `Date & time: ${dateTime}`,
    `Duration: ${params.durationMinutes} minutes`,
    `Format: ${formatLabel}`,
    "",
    params.sessionFormat === "online" && params.meetingUrl ? `Join Google Meet: ${params.meetingUrl}` : "",
    "",
    `View session: ${ctaUrl}`,
  );

  return { subject, html, text };
}

export function sessionReminderExpertEmail(params: {
  customerName: string;
  startAt: string;
  expertTimezone: string | null;
  durationMinutes: number;
  sessionFormat: string;
  bookingReference: string;
  meetingUrl: string | null;
  discussionTopic: string | null;
  offsetMinutes: number;
  appUrl: string;
}): EmailContent {
  const dateTime = formatSessionDateTime(params.startAt, params.expertTimezone);
  const formatLabel = SESSION_FORMAT_LABELS[params.sessionFormat as "online" | "in_person"] ?? params.sessionFormat;
  const ctaUrl = `${params.appUrl}/expert/sessions/${encodeURIComponent(params.bookingReference)}`;
  const subject = `Upcoming Pivotroom session ${offsetLabel(params.offsetMinutes)}`;
  const topicHtml = params.discussionTopic
    ? `<p style="margin:12px 0 0 0;"><strong>Discussion topic:</strong> ${escapeHtml(truncate(params.discussionTopic, 200))}</p>`
    : "";

  const html = renderShell({
    heading: "Upcoming session",
    bodyHtml: `
      ${fieldsTableHtml(
        fieldRowHtml("Customer", params.customerName) +
          fieldRowHtml("Date & time", dateTime) +
          fieldRowHtml("Duration", `${params.durationMinutes} minutes`) +
          fieldRowHtml("Format", formatLabel),
      )}
      ${meetingDetailsHtml(params.sessionFormat, params.meetingUrl)}
      ${topicHtml}
    `,
    ctaLabel: "View Session",
    ctaUrl,
  });

  const text = formatText(
    subject,
    "",
    `Customer: ${params.customerName}`,
    `Date & time: ${dateTime}`,
    `Duration: ${params.durationMinutes} minutes`,
    `Format: ${formatLabel}`,
    "",
    params.sessionFormat === "online" && params.meetingUrl ? `Join Google Meet: ${params.meetingUrl}` : "",
    params.discussionTopic ? `\nDiscussion topic: ${truncate(params.discussionTopic, 200)}` : "",
    "",
    `View session: ${ctaUrl}`,
  );

  return { subject, html, text };
}

// =========================================================================
// reschedule_email_customer / reschedule_email_expert (spec sections
// 63-64) -- current/new time, never payment details.
// =========================================================================
export function sessionRescheduledCustomerEmail(params: {
  expertName: string;
  oldStartAt: string;
  newStartAt: string;
  customerTimezone: string | null;
  durationMinutes: number;
  sessionFormat: string;
  bookingReference: string;
  meetingUrl: string | null;
  appUrl: string;
}): EmailContent {
  const oldDateTime = formatSessionDateTime(params.oldStartAt, params.customerTimezone);
  const newDateTime = formatSessionDateTime(params.newStartAt, params.customerTimezone);
  const formatLabel = SESSION_FORMAT_LABELS[params.sessionFormat as "online" | "in_person"] ?? params.sessionFormat;
  const ctaUrl = `${params.appUrl}/dashboard/sessions/${encodeURIComponent(params.bookingReference)}`;

  const html = renderShell({
    heading: "Your session has been rescheduled",
    bodyHtml: `
      <p style="margin:0;">Your session with ${escapeHtml(params.expertName)} has a new date and time.</p>
      ${fieldsTableHtml(
        fieldRowHtml("Previous time", oldDateTime) +
          fieldRowHtml("New time", newDateTime) +
          fieldRowHtml("Duration", `${params.durationMinutes} minutes`) +
          fieldRowHtml("Format", formatLabel) +
          fieldRowHtml("Booking reference", params.bookingReference),
      )}
      ${meetingDetailsHtml(params.sessionFormat, params.meetingUrl)}
    `,
    ctaLabel: "View Session",
    ctaUrl,
  });

  const text = formatText(
    "Your Pivotroom session has been rescheduled",
    "",
    `Expert: ${params.expertName}`,
    `Previous time: ${oldDateTime}`,
    `New time: ${newDateTime}`,
    `Duration: ${params.durationMinutes} minutes`,
    `Format: ${formatLabel}`,
    `Booking reference: ${params.bookingReference}`,
    "",
    `View your session: ${ctaUrl}`,
  );

  return { subject: "Your Pivotroom session has been rescheduled", html, text };
}

export function sessionRescheduledExpertEmail(params: {
  customerName: string;
  oldStartAt: string;
  newStartAt: string;
  expertTimezone: string | null;
  durationMinutes: number;
  sessionFormat: string;
  bookingReference: string;
  meetingUrl: string | null;
  appUrl: string;
}): EmailContent {
  const oldDateTime = formatSessionDateTime(params.oldStartAt, params.expertTimezone);
  const newDateTime = formatSessionDateTime(params.newStartAt, params.expertTimezone);
  const formatLabel = SESSION_FORMAT_LABELS[params.sessionFormat as "online" | "in_person"] ?? params.sessionFormat;
  const ctaUrl = `${params.appUrl}/expert/sessions/${encodeURIComponent(params.bookingReference)}`;

  const html = renderShell({
    heading: "A session has been rescheduled",
    bodyHtml: `
      <p style="margin:0;">Your confirmed session with ${escapeHtml(params.customerName)} has a new date and time.</p>
      ${fieldsTableHtml(
        fieldRowHtml("Previous time", oldDateTime) +
          fieldRowHtml("New time", newDateTime) +
          fieldRowHtml("Duration", `${params.durationMinutes} minutes`) +
          fieldRowHtml("Format", formatLabel) +
          fieldRowHtml("Booking reference", params.bookingReference),
      )}
      ${meetingDetailsHtml(params.sessionFormat, params.meetingUrl)}
    `,
    ctaLabel: "View Session",
    ctaUrl,
  });

  const text = formatText(
    "A confirmed Pivotroom session has been rescheduled",
    "",
    `Customer: ${params.customerName}`,
    `Previous time: ${oldDateTime}`,
    `New time: ${newDateTime}`,
    `Duration: ${params.durationMinutes} minutes`,
    `Format: ${formatLabel}`,
    `Booking reference: ${params.bookingReference}`,
    "",
    `View session: ${ctaUrl}`,
  );

  return { subject: "A confirmed Pivotroom session has been rescheduled", html, text };
}

// =========================================================================
// cancellation_email_customer / cancellation_email_expert (spec sections
// 45-46) -- never claims a refund, never includes payment amounts.
// =========================================================================
export function sessionCancelledCustomerEmail(params: {
  expertName: string;
  startAt: string;
  customerTimezone: string | null;
  bookingReference: string;
  financialFollowupRequired: boolean;
  appUrl: string;
}): EmailContent {
  const dateTime = formatSessionDateTime(params.startAt, params.customerTimezone);
  const ctaUrl = `${params.appUrl}/dashboard/sessions/${encodeURIComponent(params.bookingReference)}`;
  const followupLine = params.financialFollowupRequired
    ? "If financial follow-up is applicable, Pivotroom will handle it separately."
    : "";

  const html = renderShell({
    heading: "Your session has been cancelled",
    bodyHtml: `
      <p style="margin:0;">Your session with ${escapeHtml(params.expertName)} has been cancelled.</p>
      ${fieldsTableHtml(fieldRowHtml("Expert", params.expertName) + fieldRowHtml("Date & time", dateTime) + fieldRowHtml("Booking reference", params.bookingReference))}
      ${followupLine ? `<p style="margin:12px 0 0 0;">${escapeHtml(followupLine)}</p>` : ""}
    `,
    ctaLabel: "View Session",
    ctaUrl,
  });

  const text = formatText(
    "Your Pivotroom session has been cancelled",
    "",
    `Expert: ${params.expertName}`,
    `Date & time: ${dateTime}`,
    `Booking reference: ${params.bookingReference}`,
    followupLine,
    "",
    `View session: ${ctaUrl}`,
  );

  return { subject: "Your Pivotroom session has been cancelled", html, text };
}

export function sessionCancelledExpertEmail(params: {
  customerName: string;
  startAt: string;
  expertTimezone: string | null;
  bookingReference: string;
  appUrl: string;
}): EmailContent {
  const dateTime = formatSessionDateTime(params.startAt, params.expertTimezone);
  const ctaUrl = `${params.appUrl}/expert/sessions`;

  const html = renderShell({
    heading: "A session has been cancelled",
    bodyHtml: `
      <p style="margin:0;">Your confirmed session with ${escapeHtml(params.customerName)} has been cancelled.</p>
      ${fieldsTableHtml(fieldRowHtml("Customer", params.customerName) + fieldRowHtml("Date & time", dateTime) + fieldRowHtml("Booking reference", params.bookingReference))}
    `,
    ctaLabel: "View Sessions",
    ctaUrl,
  });

  const text = formatText(
    "A confirmed Pivotroom session has been cancelled",
    "",
    `Customer: ${params.customerName}`,
    `Date & time: ${dateTime}`,
    `Booking reference: ${params.bookingReference}`,
    "",
    `View sessions: ${ctaUrl}`,
  );

  return { subject: "A confirmed Pivotroom session has been cancelled", html, text };
}

// =========================================================================
// reschedule_request_email_customer (spec section 31) -- notifies the
// customer of an expert-initiated change request; never changes the
// booking itself.
// =========================================================================
export function expertRescheduleRequestedEmail(params: {
  expertName: string;
  startAt: string;
  customerTimezone: string | null;
  bookingReference: string;
  reason: string;
  appUrl: string;
}): EmailContent {
  const dateTime = formatSessionDateTime(params.startAt, params.customerTimezone);
  const ctaUrl = `${params.appUrl}/dashboard/sessions/${encodeURIComponent(params.bookingReference)}`;

  const html = renderShell({
    heading: "Your expert has requested a schedule change",
    bodyHtml: `
      <p style="margin:0;">${escapeHtml(params.expertName)} has requested a change to your upcoming session.</p>
      ${fieldsTableHtml(fieldRowHtml("Current time", dateTime) + fieldRowHtml("Booking reference", params.bookingReference))}
      <p style="margin:12px 0 0 0;"><strong>Reason:</strong> ${escapeHtml(truncate(params.reason, 300))}</p>
      <p style="margin:12px 0 0 0;">Your session has not been changed yet -- please choose a new time that works for you.</p>
    `,
    ctaLabel: "Choose a New Time",
    ctaUrl,
  });

  const text = formatText(
    "Your expert has requested a schedule change",
    "",
    `Expert: ${params.expertName}`,
    `Current time: ${dateTime}`,
    `Booking reference: ${params.bookingReference}`,
    `Reason: ${truncate(params.reason, 300)}`,
    "",
    "Your session has not been changed yet -- please choose a new time that works for you.",
    "",
    `Choose a new time: ${ctaUrl}`,
  );

  return { subject: "Your expert has requested a schedule change", html, text };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
