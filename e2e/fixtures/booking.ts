import type { Page } from "@playwright/test";

/**
 * Drives the real public booking picker (components/booking/BookingPicker.tsx)
 * through duration -> (format, if there's a real choice) -> first available
 * date -> first available time -> "Reserve This Time", and returns the
 * booking reference from the resulting /booking/[reference] redirect.
 *
 * Assumes the expert fixture has exactly one active session type (30 min,
 * online-only) as provisioned by ensureApprovedExpert() in
 * supabase-admin.ts -- so there is no format step (online_enabled is the
 * only enabled format) and duration selection is a single button.
 *
 * Assumes at least one bookable slot exists in the current or next month
 * for the fixture's day-of-month-28 recurring rule; if "Next" is needed to
 * reach a month with an occurrence (e.g. run on the 29th-31st with no
 * slots left this month), this helper pages forward up to 2 months before
 * giving up, since day 28 always exists next month.
 */
export async function reserveFirstAvailableSlot(
  page: Page,
  expertSlug: string,
  durationMinutes = 30,
): Promise<string> {
  await page.goto(`/book/${expertSlug}`);

  await page.getByRole("button", { name: new RegExp(`^${durationMinutes} min`) }).click();

  let attempts = 0;
  while (attempts < 3) {
    const loading = page.getByText("Loading available times...");
    if (await loading.isVisible().catch(() => false)) {
      await loading.waitFor({ state: "hidden", timeout: 15_000 });
    }

    const noSlots = page.getByText(/No available times for this session length/);
    if (await noSlots.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Next →" }).click();
      attempts += 1;
      continue;
    }
    break;
  }

  // First date pill under "3. Date & time", then first time pill under it.
  const dateSection = page.locator("section", { hasText: "3. Date & time" });
  const firstDateButton = dateSection.locator("button").first();
  await firstDateButton.click();

  // Time pills render as a second button row inside the same section,
  // after a date is selected -- picking `nth(1)` (the row after the date
  // pills) would be brittle across viewport wraps, so instead re-query
  // for the newly-visible "Reserve This Time" section's sibling time
  // buttons by taking the last row of buttons in the section.
  const timeButtons = dateSection.locator("button");
  const count = await timeButtons.count();
  // The date pills come first; after clicking one, new time-pill buttons
  // are appended, so the last button in the section is a time slot.
  await timeButtons.nth(count - 1).click();

  await page.getByRole("button", { name: "Reserve This Time" }).click();
  await page.waitForURL(/\/booking\/[^/]+$/);

  const url = new URL(page.url());
  const reference = url.pathname.split("/").pop();
  if (!reference) throw new Error("Failed to extract booking reference from URL: " + page.url());
  return reference;
}

/**
 * Fills the "Your professional background" step of BookingJourney, if it
 * is currently showing (a customer_profiles row provisioned by
 * ensureTestFixtures already satisfies this for every fixture customer,
 * so this is a no-op for fixture accounts -- kept for completeness /
 * fresh-account scenarios).
 */
export async function completeBookingProfileStepIfPresent(page: Page) {
  const heading = page.getByRole("heading", { name: "Your professional background" });
  if (!(await heading.isVisible().catch(() => false))) return;

  await page.getByLabel("Current role").fill("Software Engineer");
  await page.getByLabel("Employment type").selectOption({ index: 1 });
  await page.getByLabel("Industry").selectOption({ index: 1 });
  await page.getByLabel("Years of experience").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function fillBookingIntake(
  page: Page,
  fields: { discussionTopic: string; additionalContext: string },
) {
  await page
    .getByLabel("What would you like to discuss during this session?")
    .fill(fields.discussionTopic);
  await page
    .getByLabel("Give the expert any useful context before the session.")
    .fill(fields.additionalContext);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function continueToPayment(page: Page) {
  await page.getByRole("button", { name: "Continue to Payment" }).click();
  await page.waitForURL(/\/booking\/[^/]+\/payment$/);
}

export async function submitManualPayment(
  page: Page,
  fields: { bankUsed: string; transactionReference: string; amountPaid: string },
) {
  await page.getByLabel("Bank used").fill(fields.bankUsed);
  await page.getByLabel("Transaction / reference ID").fill(fields.transactionReference);
  await page.getByLabel("Amount paid").fill(fields.amountPaid);
  await page.getByRole("button", { name: "Submit Payment for Verification" }).click();
}
