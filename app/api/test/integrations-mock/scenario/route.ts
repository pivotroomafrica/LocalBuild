import { NextResponse, type NextRequest } from "next/server";
import { setEmailMockScenario, type EmailMockScenario } from "@/lib/email/mockControl";
import { setCalendarMockScenario, type CalendarMockScenario } from "@/lib/calendar/mockControl";

/**
 * Test-only control endpoint -- same pattern as
 * /api/test/chapa-mock/scenario (Phase 8). Lets a Playwright test set
 * the next email/calendar scenario on the running server process before
 * triggering a confirmation and/or the worker. 404s outside
 * INTEGRATIONS_MODE=mock -- never reachable in production.
 */
export async function POST(request: NextRequest) {
  if (process.env.INTEGRATIONS_MODE !== "mock") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; calendar?: string }
    | null;

  if (body?.email) {
    if (body.email !== "success" && body.email !== "failure") {
      return NextResponse.json({ error: "email scenario must be 'success' or 'failure'" }, { status: 400 });
    }
    setEmailMockScenario(body.email as EmailMockScenario);
  }
  if (body?.calendar) {
    if (body.calendar !== "success" && body.calendar !== "failure") {
      return NextResponse.json({ error: "calendar scenario must be 'success' or 'failure'" }, { status: 400 });
    }
    setCalendarMockScenario(body.calendar as CalendarMockScenario);
  }

  return NextResponse.json({ ok: true });
}
