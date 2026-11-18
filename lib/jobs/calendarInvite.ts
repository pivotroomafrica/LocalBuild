import { googleCalendarUrl, icsBody, type CalendarEvent } from "@/lib/booking/calendar";
import type { EmailAttachment } from "@/lib/email/provider";
import type { EmailContent } from "./emailTemplates";

/** The address calendar invites name as the organizer: the sending
 * address (PIVOTROOM_EMAIL_FROM), so mail apps trust the invite. */
function organizerEmail(): string {
  const from = process.env.PIVOTROOM_EMAIL_FROM?.trim() ?? "";
  const match = from.match(/<([^>]+)>/);
  const address = (match ? match[1] : from).trim();
  return address.includes("@") ? address : "hello@pivotroom.africa";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type SessionInviteKind = "confirm" | "reschedule" | "cancel";

/**
 * The "add to calendar" part of a booking email: a Google Calendar button
 * and an attached invite (.ics) that Apple Calendar, Outlook and Gmail
 * open as an event.
 *
 * The invite's UID is the Google Calendar event's own (<id>@google.com)
 * when Pivotroom's Google invite exists, so calendars merge the two into
 * one event instead of showing it twice; otherwise the booking reference.
 * A reschedule sends the same UID with a higher SEQUENCE (the event
 * moves); a cancellation sends METHOD:CANCEL (the event is removed).
 */
export function sessionInvite(args: {
  kind: SessionInviteKind;
  audience: "customer" | "expert";
  bookingReference: string;
  /** The other person in the session. */
  withName: string;
  recipient: { name: string; email: string };
  startAt: string;
  endAt: string;
  sessionFormat: string;
  meetingUrl: string | null;
  googleEventId: string | null;
  sequence: number;
  appUrl: string;
}): { attachment: EmailAttachment; html: string; text: string } {
  const online = args.sessionFormat === "online";
  const sessionUrl = `${args.appUrl}/${args.audience === "expert" ? "expert" : "dashboard"}/sessions/${encodeURIComponent(args.bookingReference)}`;
  const event: CalendarEvent = {
    title: `Pivotroom session with ${args.withName}`,
    description: [
      online
        ? args.meetingUrl
          ? `Online. Join on Google Meet: ${args.meetingUrl}`
          : "Online. The Google Meet link will be on your session page before the session."
        : "In person. Agree the place with each other before the session.",
      `Booking reference: ${args.bookingReference}`,
      `Session page: ${sessionUrl}`,
      "Need to move or cancel? Use the session page. Questions: hello@pivotroom.africa",
    ].join("\n"),
    location: online ? (args.meetingUrl ?? "Online (Google Meet)") : "In person",
    startAt: args.startAt,
    endAt: args.endAt,
    uid: args.bookingReference,
  };

  const ics = icsBody(event, {
    method: args.kind === "cancel" ? "CANCEL" : "REQUEST",
    sequence: args.sequence,
    uid: args.googleEventId ? `${args.googleEventId}@google.com` : undefined,
    organizer: { name: "Pivotroom", email: organizerEmail() },
    attendee: args.recipient,
  });
  const filename = `pivotroom-${args.bookingReference}.ics`;
  const attachment: EmailAttachment = {
    filename,
    content: ics,
    contentType: `text/calendar; charset=utf-8; method=${args.kind === "cancel" ? "CANCEL" : "REQUEST"}`,
  };

  if (args.kind === "cancel") {
    return {
      attachment,
      html: `
        <div style="margin:16px 0 0 0;padding:14px 16px;border-radius:8px;background-color:#f5f5f4;">
          <p style="margin:0;font-weight:600;color:#1c1917;">Remove it from your calendar</p>
          <p style="margin:6px 0 0 0;">Open the attached file (${escapeHtml(filename)}) to remove the session from Apple Calendar or Outlook. If you added it with the Google Calendar button, delete it there.</p>
        </div>`,
      text: `Remove it from your calendar: open the attached ${filename} (Apple Calendar, Outlook). If you added it to Google Calendar yourself, delete it there.`,
    };
  }

  const googleUrl = googleCalendarUrl(event);
  const lead = args.kind === "reschedule" ? "Update your calendar" : "Add it to your calendar";
  const fileNote =
    args.kind === "reschedule"
      ? `Apple Calendar or Outlook: open the attached file (${filename}) and the session moves to the new time.`
      : `Apple Calendar or Outlook: open the attached file (${filename}).`;
  return {
    attachment,
    html: `
        <div style="margin:16px 0 0 0;padding:14px 16px;border-radius:8px;background-color:#f5f5f4;">
          <p style="margin:0 0 10px 0;font-weight:600;color:#1c1917;">${lead}</p>
          <a href="${escapeHtml(googleUrl)}" style="display:inline-block;background-color:#ffffff;border:1px solid #d6d3d1;color:#1c1917;text-decoration:none;font-size:14px;font-weight:600;padding:8px 14px;border-radius:6px;">&#128197; Add to Google Calendar</a>
          <p style="margin:10px 0 0 0;font-size:13px;color:#57534e;">${escapeHtml(fileNote)}${
            args.kind === "reschedule" ? " In Google Calendar, change the time of the event you added." : ""
          }</p>
        </div>`,
    text: [
      `${lead}:`,
      `Google Calendar: ${googleUrl}`,
      fileNote,
    ].join("\n"),
  };
}

/** Puts the calendar block into an email: in the HTML just above the
 * button, and at the end of the plain-text version. */
export function withCalendarBlock(content: EmailContent, block: { html: string; text: string }): EmailContent {
  const marker = "<!--calendar-->";
  const html = content.html.includes(marker)
    ? content.html.replace(marker, block.html)
    : content.html.replace("</body>", `${block.html}</body>`);
  return { ...content, html, text: `${content.text}\n\n${block.text}` };
}
