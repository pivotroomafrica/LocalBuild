import { NextResponse } from "next/server";
import { resetEmailMock } from "@/lib/email/mockControl";
import { resetCalendarMock } from "@/lib/calendar/mockControl";

/** Test-only reset endpoint -- clears recorded sent-emails/created-events
 * and resets both scenarios to 'success' between test cases sharing one
 * running server process. 404s outside INTEGRATIONS_MODE=mock. */
export async function POST() {
  if (process.env.INTEGRATIONS_MODE !== "mock") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  resetEmailMock();
  resetCalendarMock();
  return NextResponse.json({ ok: true });
}
