/** Calendar links for a booked session (Google Calendar template URL and
 * an .ics body). Times are UTC instants, so they land correctly in any
 * calendar's own timezone. */
type CalendarEvent = {
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
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function icsBody(event: CalendarEvent): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pivotroom//Booking//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@pivotroom.africa`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(event.startAt)}`,
    `DTEND:${utcStamp(event.endAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
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
