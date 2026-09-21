import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client -- bypasses RLS entirely, using
 * SUPABASE_SERVICE_ROLE_KEY (reserved for exactly this since Phase 1's
 * .env.example: "future admin/server-only operations"). This is its
 * first real use: the Chapa webhook and return routes have no
 * authenticated user session (a webhook call has no cookies at all) but
 * still need to call finalize_chapa_payment() (042), which is itself
 * granted EXECUTE to service_role only -- never anon/authenticated.
 *
 * Never imported from a "use client" file or any code path reachable
 * from the browser. Used for two purposes: calling the narrow,
 * purpose-built SECURITY DEFINER functions that expect a service-role
 * caller (finalize_chapa_payment, 042), and -- as of Phase 9 -- the
 * integration_jobs worker (lib/jobs/*), which also has no user session
 * (a cron-triggered HTTP call has no cookies either) and legitimately
 * needs to read/claim/complete outbox rows and write bookings.calendar_*
 * state directly, since no real user should ever be able to do either of
 * those (integration_jobs has no authenticated-role grant at all, and
 * calendar_* columns are never client-writable). Never used to bypass
 * RLS for a table read/write a real user session should be going
 * through instead.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be configured.");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
