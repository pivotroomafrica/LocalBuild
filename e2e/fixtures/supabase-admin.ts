import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig, testFixtures, type FixtureKey } from "./env";

/**
 * Service-role Supabase client -- bypasses RLS entirely. This is exactly
 * what SUPABASE_SERVICE_ROLE_KEY in .env.example is reserved for ("future
 * admin/server-only operations"); no app code path uses it, only this
 * test-fixture layer, and it never runs in the browser.
 *
 * Used for two things ONLY:
 *   1. Provisioning/cleaning up deterministic test fixture accounts and
 *      their rows (spec section 2 -- test data safety).
 *   2. Direct, deterministic time-travel on hold_expires_at for expiry/
 *      grace-period tests (spec section 4 -- no real waiting), WITHOUT
 *      touching any production business logic.
 * It must never be used to bypass a security check the suite is trying
 * to verify -- every actual authorization/RLS assertion in this suite
 * goes through the real browser session (Playwright's `page`), never
 * this client.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const FIXTURE_KEYS: FixtureKey[] = ["customerA", "customerB", "expertA", "expertB", "admin", "dualIdentity"];

export type ProvisionedFixture = {
  key: FixtureKey;
  userId: string;
  email: string;
  password: string;
  expertProfileId?: string;
  expertSlug?: string;
};

async function getOrCreateAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  // listUsers doesn't support filtering by email directly in every SDK
  // version, so page through (fixture accounts are few -- this is cheap
  // and avoids a hard dependency on a specific admin API shape).
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing.id;
    if (data.users.length < 200) break;
    page += 1;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // never goes through the real signup+verify-email flow -- see e2e/README.md
  });
  if (createError || !created.user) {
    throw new Error(`Failed to create fixture auth user ${email}: ${createError?.message}`);
  }
  return created.user.id;
}

async function ensureProfile(
  admin: SupabaseClient,
  userId: string,
  fullName: string,
  phone: string,
  role: "customer" | "admin",
) {
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, full_name: fullName, phone, role, account_status: "active" }, { onConflict: "id" });
  if (error) throw error;
}

async function ensureCustomerProfile(admin: SupabaseClient, userId: string) {
  const { data: industry } = await admin.from("industries").select("id").eq("is_active", true).limit(1).maybeSingle();
  const { error } = await admin.from("customer_profiles").upsert(
    {
      user_id: userId,
      current_role: "Software Engineer",
      employment_type: "full_time",
      years_experience_range: "3_5",
      industry_id: industry?.id ?? null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/**
 * Provisions an already-approved-and-published expert profile directly
 * (bypassing the multi-step application wizard, which is exercised
 * end-to-end separately and deliberately in
 * e2e/specs/expert-application.spec.ts). This is a pragmatic choice: every
 * OTHER spec (availability, booking, payments, dashboards, security) needs
 * a ready-to-book expert as background fixture state, not as the behavior
 * under test, and driving the 4-step wizard + admin approval through the
 * UI for every test run would be slow and would make those specs' pass/
 * fail depend on wizard behavior they aren't actually testing.
 */
async function ensureApprovedExpert(
  admin: SupabaseClient,
  userId: string,
  slug: string,
  headline: string,
): Promise<{ expertProfileId: string }> {
  const { data: existing } = await admin
    .from("expert_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const row = {
    user_id: userId,
    slug,
    headline,
    current_position: "Staff Engineer",
    current_company: "Pivotroom E2E Fixtures",
    years_experience_range: "6_10",
    short_bio: "Deterministic E2E test fixture expert profile.",
    expertise_summary: "E2E test fixture.",
    problems_help_with: "E2E test fixture.",
    who_i_help: "E2E test fixture.",
    country: "Ethiopia",
    city: "Addis Ababa",
    base_hourly_price: 50000,
    online_enabled: true,
    in_person_enabled: false,
    application_status: "approved",
    profile_status: "published",
    submitted_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  };

  let expertProfileId: string;
  if (existing) {
    const { error } = await admin.from("expert_profiles").update(row).eq("id", existing.id);
    if (error) throw error;
    expertProfileId = existing.id;
  } else {
    const { data: inserted, error } = await admin.from("expert_profiles").insert(row).select("id").single();
    if (error) throw error;
    expertProfileId = inserted.id;
  }

  // At least one active, bookable session type (30 min, online) -- the
  // minimum BookingPicker needs to render a selectable offering.
  const { data: sessionType } = await admin
    .from("expert_session_types")
    .select("id")
    .eq("expert_profile_id", expertProfileId)
    .eq("duration_minutes", 30)
    .maybeSingle();
  if (!sessionType) {
    const { error } = await admin.from("expert_session_types").insert({
      expert_profile_id: expertProfileId,
      duration_minutes: 30,
      base_price: 25000,
      currency: "ETB",
      online_enabled: true,
      in_person_enabled: false,
      is_active: true,
    });
    if (error) throw error;
  }

  // Availability: a recurring monthly rule on day-of-month 28, 09:00-13:00
  // local time (4 hours/month, within the 1-5 hour policy range), plus a
  // timezone setting -- enough for get_bookable_slots() to surface real
  // occurrences for booking-flow tests without depending on "today"'s
  // exact date (day 28 exists in every month, unlike day 29-31).
  const { error: tzError } = await admin
    .from("expert_availability_settings")
    .upsert({ expert_profile_id: expertProfileId, timezone: "Africa/Addis_Ababa" }, { onConflict: "expert_profile_id" });
  if (tzError) throw tzError;

  const { data: existingRule } = await admin
    .from("expert_monthly_availability_rules")
    .select("id")
    .eq("expert_profile_id", expertProfileId)
    .eq("day_of_month", 28)
    .maybeSingle();
  if (!existingRule) {
    const { error } = await admin.from("expert_monthly_availability_rules").insert({
      expert_profile_id: expertProfileId,
      day_of_month: 28,
      start_time: "09:00",
      end_time: "13:00",
    });
    if (error) throw error;
  }

  return { expertProfileId };
}

/**
 * Idempotently provisions all six deterministic test fixture accounts
 * (spec section 2's required set). Safe to call at the start of every
 * spec file / run -- upserts, never duplicates. Returns a lookup map
 * keyed by FixtureKey with everything a spec needs (userId, credentials,
 * and expertProfileId/slug for the two expert-bearing fixtures).
 */
export async function ensureTestFixtures(): Promise<Record<FixtureKey, ProvisionedFixture>> {
  const admin = createAdminClient();
  const result = {} as Record<FixtureKey, ProvisionedFixture>;

  for (const key of FIXTURE_KEYS) {
    const cfg = testFixtures[key];
    const userId = await getOrCreateAuthUser(admin, cfg.email, cfg.password);
    const role = key === "admin" ? "admin" : "customer";
    await ensureProfile(admin, userId, cfg.fullName, cfg.phone, role);

    result[key] = { key, userId, email: cfg.email, password: cfg.password };

    // Customer-bearing identities (every fixture except a pure expert)
    // get a complete customer_profiles row so booking-flow tests don't
    // trip the "professional profile first" gate unexpectedly.
    if (key !== "expertA" && key !== "expertB") {
      await ensureCustomerProfile(admin, userId);
    }

    // Expert-bearing identities (expertA, expertB, and dualIdentity, which
    // is deliberately BOTH a customer and an approved expert on the same
    // auth user -- the exact shape the RLS-OR-combination regression
    // tests in dashboards.spec.ts / security.spec.ts require) get an
    // approved+published profile.
    if (key === "expertA" || key === "expertB" || key === "dualIdentity") {
      const slug = key === "expertA" ? "test-expert-a" : key === "expertB" ? "test-expert-b" : "test-dual-identity";
      const { expertProfileId } = await ensureApprovedExpert(admin, userId, slug, `${cfg.fullName} (E2E fixture)`);
      result[key].expertProfileId = expertProfileId;
      result[key].expertSlug = slug;
    }
  }

  return result;
}

/**
 * Deletes ONLY rows that belong to the fixture accounts above (spec
 * section 2: "do not delete non-test data... only delete records
 * explicitly belonging to test fixtures"). Never touches the fixture
 * AUTH USERS or PROFILES themselves -- those stay provisioned across runs
 * (ensureTestFixtures is idempotent), only their transactional rows
 * (bookings/payments/availability overrides created BY a test) are
 * cleared, and only for bookings/payments this helper is told about.
 */
export async function cleanupBooking(bookingId: string) {
  const admin = createAdminClient();
  await admin.from("payments").delete().eq("booking_id", bookingId);
  await admin.from("booking_intake").delete().eq("booking_id", bookingId);
  await admin.from("bookings").delete().eq("id", bookingId);
}

export async function cleanupAvailabilityForExpert(expertProfileId: string) {
  const admin = createAdminClient();
  await admin.from("expert_availability_overrides").delete().eq("expert_profile_id", expertProfileId);
  await admin.from("expert_one_off_availability").delete().eq("expert_profile_id", expertProfileId);
}

/**
 * Deterministic time-travel: directly backdates a booking's
 * hold_expires_at so expiry logic (get_bookable_slots' exclusion,
 * create_booking_hold's lazy cleanup, the payment page's isHoldExpired
 * check, the rejection-grace countdown) can be asserted WITHOUT waiting
 * real minutes/hours and WITHOUT adding any TEST_*_SECONDS override to
 * the production SQL policy-constant functions -- see e2e/README.md
 * "Time-based testing strategy" for the full rationale. Bypasses RLS via
 * the service-role client; this is test setup, not something a real user
 * or the app itself can do.
 */
export async function backdateHoldExpiry(bookingId: string, secondsAgo: number) {
  const admin = createAdminClient();
  const pastIso = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const { error } = await admin.from("bookings").update({ hold_expires_at: pastIso }).eq("id", bookingId);
  if (error) throw error;
}

export async function getBookingByReference(admin: SupabaseClient, reference: string) {
  const { data, error } = await admin.from("bookings").select("*").eq("booking_reference", reference).single();
  if (error) throw error;
  return data;
}
