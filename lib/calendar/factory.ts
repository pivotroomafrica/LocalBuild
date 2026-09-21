import type { CalendarProvider } from "./provider";
import { GoogleCalendarProvider } from "./google";
import { FakeCalendarProvider } from "./fake";

/** The one place application code asks for a calendar client -- never
 * imports GoogleCalendarProvider/FakeCalendarProvider directly (spec
 * section 69). INTEGRATIONS_MODE=mock (Playwright test environment only)
 * selects the fake. */
export function getCalendarProvider(): CalendarProvider {
  if (process.env.INTEGRATIONS_MODE === "mock") return new FakeCalendarProvider();
  return new GoogleCalendarProvider();
}
