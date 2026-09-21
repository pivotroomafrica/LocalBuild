import { NextResponse } from "next/server";
import { getSentEmails } from "@/lib/email/mockControl";
import { getCreatedEvents } from "@/lib/calendar/mockControl";

/** Test-only read-back endpoint -- lets a Playwright test assert on what
 * FakeEmailProvider/FakeCalendarProvider actually recorded (spec
 * sections 70-73). 404s outside INTEGRATIONS_MODE=mock. */
export async function GET() {
  if (process.env.INTEGRATIONS_MODE !== "mock") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    sentEmails: getSentEmails(),
    createdEvents: getCreatedEvents(),
  });
}
