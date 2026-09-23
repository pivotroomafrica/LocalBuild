import type { Page } from "@playwright/test";

/**
 * Phase 12 (critical architecture change): drives the real inline booking
 * rail (components/booking/BookingRail.tsx + components/booking/rail/*)
 * mounted on the expert's own public profile -- there is no longer a
 * standalone /book/[slug] picker or /booking/[reference] journey page.
 * SESSION -> TIME -> (Reserve This Time) all happen in place on
 * /experts/[slug]; a hold's existence is reflected by the profile URL
 * gaining `?booking=<reference>` (BookingRail's own router.push), which
 * this helper waits for instead of a page navigation to a different
 * route.
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
  await page.goto(`/experts/${expertSlug}`);

  // Below the lg breakpoint the rail starts life inside a closed bottom
  // sheet (BookingRail.tsx) -- "Book a session" must be tapped to reveal
  // it before the duration chip is reachable at all. At the default
  // desktop viewport the sticky aside is already visible and this
  // trigger simply isn't rendered, so this is a no-op there.
  const mobileTrigger = page.getByRole("button", { name: "Book a session" });
  if (await mobileTrigger.isVisible().catch(() => false)) await mobileTrigger.click();

  const durationButton = page.getByRole("button", { name: new RegExp(`^${durationMinutes} min`) });
  await durationButton.click();

  let attempts = 0;
  while (attempts < 3) {
    const loading = page.getByText("Loading available times…");
    if (await loading.isVisible().catch(() => false)) {
      await loading.waitFor({ state: "hidden", timeout: 15_000 });
    }

    const noSlots = page.getByText(/No available times in/);
    if (await noSlots.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Next month" }).click();
      attempts += 1;
      continue;
    }
    break;
  }

  // First date chip, then first time chip revealed under it, within the
  // rail's own date/time block (data-testid, since duration buttons
  // above it in the same "Session options" card ALSO carry
  // aria-pressed, so a query scoped to the whole card would be
  // ambiguous).
  const dateTimeBlock = page.getByTestId("rail-date-time");
  const dateChips = dateTimeBlock.locator("button[aria-pressed]");
  await dateChips.first().click();

  const chipsAfterDate = dateTimeBlock.locator("button[aria-pressed]");
  const count = await chipsAfterDate.count();
  // Date chips come first; after picking one, time chips are appended --
  // the last aria-pressed button in the block is a time slot.
  await chipsAfterDate.nth(count - 1).click();

  await page.getByRole("button", { name: "Reserve This Time" }).click();
  await page.waitForURL(/[?&]booking=[^&]+/, { timeout: 15_000 });

  const url = new URL(page.url());
  const reference = url.searchParams.get("booking");
  if (!reference) throw new Error("Failed to extract booking reference from URL: " + page.url());
  return reference;
}

/**
 * Fills the "Your professional background" gate, if it is currently
 * showing -- now rendered inline in the rail BEFORE a hold exists (spec:
 * AUTH_OR_PROFILE precedes HOLD), not after it. A customer_profiles row
 * provisioned by ensureTestFixtures already satisfies this for every
 * fixture customer, so this is a no-op for fixture accounts -- kept for
 * completeness / fresh-account scenarios, and called (if needed) BEFORE
 * reserveFirstAvailableSlot rather than after.
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

/**
 * "Continue to payment" (sentence case, Phase 12) -- stays on the SAME
 * `?booking=<reference>` URL, since the rail transitions to PAYMENT in
 * place rather than navigating to a standalone payment page. Waits for
 * the review card to be replaced by the payment card instead of a URL
 * change.
 */
export async function continueToPayment(page: Page) {
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("heading", { name: "Manual bank transfer" }).waitFor({ timeout: 15_000 });
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
