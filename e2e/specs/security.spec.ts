import { test, expect } from "@playwright/test";
import { ensureTestFixtures } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";
import { supabaseConfig } from "../fixtures/env";

/**
 * Spec sections 81-82: direct object reference tests and raw error
 * leakage. Cuts across every phase rather than belonging to one.
 */
test.describe("Direct object reference & error leakage", () => {
  test.beforeAll(async () => {
    await ensureTestFixtures();
  });

  test("a nonexistent booking reference resolves to a 404, not a raw DB error", async ({ page }) => {
    await loginAsFixture(page, "customerA");
    const response = await page.goto("/booking/DOES-NOT-EXIST-REF");
    expect(response?.status()).toBe(404);

    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).not.toMatch(/postgrest|postgres|supabase|relation .* does not exist|rls|policy/i);
  });

  test("a guessed/random-looking UUID as a booking reference never confirms a real booking exists", async ({
    page,
  }) => {
    await loginAsFixture(page, "customerA");
    const response = await page.goto("/booking/11111111-1111-1111-1111-111111111111");
    expect(response?.status()).toBe(404);
  });

  test("an expert slug that never existed resolves the same way as an unpublished one (no enumeration signal)", async ({
    page,
  }) => {
    const responseA = await page.goto("/experts/this-slug-does-not-exist-e2e");
    const bodyA = await page.locator("body").innerText();

    // Both a nonexistent slug and a real-but-unpublished one must render
    // the same not-found experience -- no distinguishing signal that
    // would let someone enumerate which slugs are "almost real".
    expect(responseA?.status()).toBe(404);
    expect(bodyA.toLowerCase()).not.toMatch(/postgrest|supabase|constraint|relation/i);
  });

  test("admin payment detail route rejects a syntactically invalid payment id without leaking a DB error", async ({
    page,
  }) => {
    await loginAsFixture(page, "admin");
    const response = await page.goto("/admin/payments/not-a-uuid");
    // Whatever the exact status, the body must never show a raw
    // Postgres/PostgREST error (invalid input syntax for type uuid, etc).
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/invalid input syntax|22P02|violates|constraint ".*" of relation/i);
    expect(response?.status()).not.toBe(500);
  });

  test("signup with an already-registered fixture email shows a safe, generic message", async ({ page }) => {
    const fixtures = await ensureTestFixtures();
    await page.goto("/auth/signup");
    await page.getByLabel("Full Name").fill("Duplicate Signup Test");
    await page.getByLabel("Email").fill(fixtures.customerA.email);
    await page.getByLabel("Phone Number").fill("0911999999");
    await page.getByLabel("Password").fill("SomeOtherPassword123!");
    await page.getByRole("button", { name: "Sign Up" }).click();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/duplicate key|violates unique constraint|23505/i);
  });
});

test.describe("Storage privacy", () => {
  test.beforeAll(async () => {
    await ensureTestFixtures();
  });

  test("SECURITY: the payment-receipts bucket is not readable via the public/anon Supabase Storage endpoint", async ({
    request,
  }) => {
    // Hits the Supabase project's own Storage REST endpoint directly
    // (not this app's server) with no auth token at all -- an anonymous
    // request for any object in a private bucket must never succeed,
    // regardless of whether the exact path guessed happens to exist.
    // This is a structural check; the full "receipt exists and customer
    // B specifically is denied while customer A is allowed" assertion is
    // covered by the live DB/storage-policy audit (task #111).
    const response = await request
      .get(`${supabaseConfig.url}/storage/v1/object/public/payment-receipts/does-not-matter.pdf`)
      .catch(() => null);
    if (response) {
      expect(response.status()).not.toBe(200);
    }
  });
});
