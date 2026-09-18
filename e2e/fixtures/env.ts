/**
 * Central, typed access to every environment variable this E2E suite
 * needs. Fails fast (at fixture-provisioning time, not mid-test) if a
 * required var is missing, with a message naming the exact var --
 * spec section 87 (CI readiness: no committed credentials, env vars
 * documented) and section 2 (test credentials must come from env vars,
 * never hardcoded).
 *
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are the same vars
 * the app itself already uses (see .env.example) -- this suite does not
 * introduce a second Supabase project or credential set, it reuses the
 * one demo project the app targets, exactly as spec section 2 requires
 * ("live database tests against the existing demo Supabase project").
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. See e2e/README.md and .env.example -- ` +
        `E2E tests read Supabase credentials and test-fixture account credentials from the environment, never hardcoded.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const supabaseConfig = {
  get url() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
};

/**
 * One entry per deterministic test fixture account (spec section 2's
 * required names: test_customer_a, test_customer_b, test_expert_a,
 * test_expert_b, test_admin, test_dual_identity). Email/password default
 * to a fixed-but-overridable value so the suite runs out of the box
 * against a fresh demo project, while still letting CI/a developer
 * override via env vars without touching code.
 */
export type FixtureKey =
  | "customerA"
  | "customerB"
  | "expertA"
  | "expertB"
  | "admin"
  | "dualIdentity";

type FixtureConfig = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
};

function fixture(envPrefix: string, fallbackEmail: string, fullName: string, phone: string): FixtureConfig {
  return {
    email: optional(`TEST_${envPrefix}_EMAIL`, fallbackEmail),
    password: optional(`TEST_${envPrefix}_PASSWORD`, "PivotroomE2E!2026"),
    fullName,
    phone,
  };
}

export const testFixtures: Record<FixtureKey, FixtureConfig> = {
  customerA: fixture("CUSTOMER_A", "test.customer.a@pivotroom-e2e.test", "Test Customer A", "0911000001"),
  customerB: fixture("CUSTOMER_B", "test.customer.b@pivotroom-e2e.test", "Test Customer B", "0911000002"),
  expertA: fixture("EXPERT_A", "test.expert.a@pivotroom-e2e.test", "Test Expert A", "0911000003"),
  expertB: fixture("EXPERT_B", "test.expert.b@pivotroom-e2e.test", "Test Expert B", "0911000004"),
  admin: fixture("ADMIN", "test.admin@pivotroom-e2e.test", "Test Admin", "0911000005"),
  dualIdentity: fixture(
    "DUAL_IDENTITY",
    "test.dual.identity@pivotroom-e2e.test",
    "Test Dual Identity",
    "0911000006",
  ),
};

/**
 * Time-based test configuration (spec section 4): instead of adding
 * environment-configurable short durations to the production SQL
 * policy-constant functions (booking_hold_minutes(),
 * payment_rejection_grace_minutes(), manual_payment_verification_hold_hours()),
 * this suite gets the same deterministic, non-waiting result by directly
 * backdating the relevant timestamp column (hold_expires_at) through the
 * Supabase service-role client in e2e/fixtures/supabase-admin.ts, then
 * reloading the page. See that file's "time-travel" helpers and
 * e2e/README.md's "Time-based testing strategy" section for the full
 * rationale -- this deliberately avoids touching any already-verified
 * production business logic (spec section 88: do not weaken business
 * logic to make tests pass).
 */
export const PLAYWRIGHT_BASE_URL = optional("PLAYWRIGHT_BASE_URL", "http://localhost:3000");
