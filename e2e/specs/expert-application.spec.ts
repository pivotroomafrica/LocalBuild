import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase-admin";
import { loginAs } from "../fixtures/auth";

/**
 * Phase 2 (expert application wizard) + Phase 3 (admin review). Unlike
 * every other spec, this one deliberately does NOT use the shared
 * ensureTestFixtures() experts (test_expert_a/b are provisioned directly
 * as already-approved, precisely so other specs don't have to re-drive
 * this wizard) -- it provisions its own disposable applicant account so
 * the wizard and the admin approve/publish decision are exercised for
 * real, start to finish, by this one spec.
 */
test.describe("Expert application wizard + admin review", () => {
  const email = `e2e.applicant.${Date.now()}@pivotroom-e2e.test`;
  const password = "PivotroomE2E!2026";
  let applicantUserId: string;

  test.beforeAll(async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Failed to create applicant: ${error?.message}`);
    applicantUserId = data.user.id;
    await admin.from("profiles").upsert({
      id: applicantUserId,
      full_name: "E2E Applicant",
      phone: "0911999998",
      role: "customer",
      account_status: "active",
    });
  });

  test.afterAll(async () => {
    const admin = createAdminClient();
    await admin.from("expert_profiles").delete().eq("user_id", applicantUserId);
    await admin.from("profiles").delete().eq("id", applicantUserId);
    await admin.auth.admin.deleteUser(applicantUserId);
  });

  test("applicant completes all three sections, submits, admin approves and publishes", async ({ page, context }) => {
    await loginAs(page, email, password);
    await page.goto("/expert/application");
    await expect(page.getByRole("heading", { name: "Expert Application" })).toBeVisible();

    // -- Section 1: Professional Profile --
    await page.getByRole("link", { name: "Professional Profile" }).click();
    await expect(page.getByRole("heading", { name: "Professional Identity" })).toBeVisible();
    await page.getByLabel("Professional Headline").fill("E2E Test Expert Headline");
    await page.getByLabel("Current Position").fill("Senior Engineer");
    await page.getByLabel("Current Company / Organization").fill("Pivotroom E2E");
    await page.getByLabel("Years of Professional Experience").selectOption({ index: 1 });
    await page.getByLabel("Short Bio").fill("This is an automated E2E test bio, well over the minimum length requirement for submission.");
    await page.getByLabel("Expertise Summary").fill("Automated testing, quality engineering, and release processes.");
    await page.getByLabel("Problems You Help With").fill("Helping teams build reliable test automation.");
    await page.getByLabel("Who You Help").fill("Engineering teams adopting E2E testing.");
    await page.getByRole("button", { name: "Save & Continue" }).click();
    await page.waitForTimeout(500);

    // -- Section 2: Expertise Categories --
    await page.goto("/expert/application/expertise");
    const firstCategory = page.locator('input[name="category_ids"]').first();
    await firstCategory.check();
    await page.getByRole("button", { name: "Save & Continue" }).click();
    await page.waitForTimeout(500);

    // -- Section 3: Session Pricing --
    await page.goto("/expert/application/sessions");
    await page.locator("#base_hourly_price").fill("40000");
    await page.locator('input[name="durations"][value="30"]').check();
    await page.locator('input[name="online_enabled"]').check();
    await page.getByRole("button", { name: "Save & Review" }).click();
    await page.waitForTimeout(500);

    // -- Submit --
    await page.goto("/expert/application");
    await expect(page.getByText("Complete").first()).toBeVisible();
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(page.getByText("Application Submitted")).toBeVisible();

    // -- Admin approves --
    const admin = createAdminClient();
    const { data: expertProfile } = await admin
      .from("expert_profiles")
      .select("id")
      .eq("user_id", applicantUserId)
      .single();
    if (!expertProfile) throw new Error("expert profile not found after submission");

    const adminPage = await context.newPage();
    await loginAs(adminPage, process.env.TEST_ADMIN_EMAIL ?? "test.admin@pivotroom-e2e.test", process.env.TEST_ADMIN_PASSWORD ?? "PivotroomE2E!2026");
    await adminPage.goto(`/admin/experts/${expertProfile.id}`);
    await expect(adminPage.getByRole("heading", { name: "E2E Applicant" })).toBeVisible();
    await adminPage.getByRole("button", { name: "Approve" }).click();
    await adminPage.waitForTimeout(500);
    await adminPage.reload();
    await adminPage.getByRole("button", { name: "Publish" }).click();
    await adminPage.waitForTimeout(500);

    const { data: after } = await admin
      .from("expert_profiles")
      .select("application_status, profile_status, slug")
      .eq("id", expertProfile.id)
      .single();
    expect(after?.application_status).toBe("approved");
    expect(after?.profile_status).toBe("published");

    // -- Public profile now reachable --
    await page.goto(`/experts/${after!.slug}`);
    await expect(page.getByText("E2E Test Expert Headline")).toBeVisible();
  });

  test("an applicant cannot approve their own application (no self-approval)", async ({ page }) => {
    await loginAs(page, email, password);
    const admin = createAdminClient();
    const { data: expertProfile } = await admin
      .from("expert_profiles")
      .select("id")
      .eq("user_id", applicantUserId)
      .single();
    if (!expertProfile) return; // depends on the previous test having run in this file's order

    const response = await page.goto(`/admin/experts/${expertProfile.id}`);
    expect(response?.status()).not.toBe(200);
  });
});
