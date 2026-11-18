/** Calendar links for a booked session (Google Calendar template URL and
 * an .ics body). Times are UTC instants, so they land correctly in any
 * calendar's own timezone. */
export type CalendarEvent = {
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  uid: string;
};

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.startAt)}/${utcStamp(event.endAt)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes are folded (RFC 5545 3.1): continuation
 * lines start with a space. Splits on characters, never inside one. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export type IcsOptions = {
  /** PUBLISH: a plain event file (download). REQUEST: an invite in an
   * email, which calendars add, or update when the UID is already there.
   * CANCEL: removes the event with that UID. */
  method?: "PUBLISH" | "REQUEST" | "CANCEL";
  /** Goes up with each change, so calendars apply updates in order. */
  sequence?: number;
  organizer?: { name: string; email: string };
  attendee?: { name: string; email: string };
  /** A full UID (with @domain); defaults to <event.uid>@pivotroom.africa. */
  uid?: string;
};

function person(kind: "ORGANIZER" | "ATTENDEE", who: { name: string; email: string }): string {
  const name = who.name.replace(/[";:,\\]/g, " ").trim() || who.email;
  const extra = kind === "ATTENDEE" ? ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE" : "";
  return `${kind};CN="${name}"${extra}:mailto:${who.email}`;
}

export function icsBody(event: CalendarEvent, options: IcsOptions = {}): string {
  const method = options.method ?? "PUBLISH";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pivotroom//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${options.uid ?? `${event.uid}@pivotroom.africa`}`,
    `SEQUENCE:${options.sequence ?? 0}`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(event.startAt)}`,
    `DTEND:${utcStamp(event.endAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    ...(options.organizer ? [person("ORGANIZER", options.organizer)] : []),
    ...(options.attendee ? [person("ATTENDEE", options.attendee)] : []),
    ...(method === "CANCEL"
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Pivotroom session", "TRIGGER:-PT30M", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function sessionCalendarEvent(booking: {
  booking_reference: string;
  start_at: string;
  end_at: string;
  session_format: string;
  calendar_meeting_url: string | null;
}, expertName: string): CalendarEvent {
  const online = booking.session_format === "online";
  return {
    title: `Pivotroom session with ${expertName}`,
    description: [
      `Booking reference ${booking.booking_reference}.`,
      online
        ? booking.calendar_meeting_url
          ? `Join on Google Meet: ${booking.calendar_meeting_url}`
          : "The Google Meet link is in your confirmation email and your Pivotroom account."
        : "In person. The meeting place is confirmed before the session.",
    ].join("\n"),
    location: online ? (booking.calendar_meeting_url ?? "Google Meet") : "In person",
    startAt: booking.start_at,
    endAt: booking.end_at,
    uid: booking.booking_reference,
  };
}
