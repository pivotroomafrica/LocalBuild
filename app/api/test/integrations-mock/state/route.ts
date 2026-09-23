import { NextResponse } from "next/server";
import { getSentEmails } from "@/lib/email/mockControl";
import { getCreatedEvents, getUpdatedEvents, getCancelledEvents } from "@/lib/calendar/mockControl";

/** Test-only read-back endpoint -- lets a Playwright test assert on what
 * FakeEmailProvider/FakeCalendarProvider actually recorded (spec
 * sections 70-73, and Phase 10's calendar_update/calendar_cancel
 * equivalents). 404s outside INTEGRATIONS_MODE=mock. */
export async function GET() {
  if (process.env.INTEGRATIONS_MODE !== "mock") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    sentEmails: getSentEmails(),
    createdEvents: getCreatedEvents(),
    updatedEvents: getUpdatedEvents(),
    cancelledEvents: getCancelledEvents(),
  });
}
