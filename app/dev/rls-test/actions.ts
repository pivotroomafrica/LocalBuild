"use server";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * TEMPORARY LOCAL DEVELOPMENT ONLY. See app/dev/rls-test/page.tsx for the
 * full warning. Delete this file together with app/dev/rls-test/ once RLS
 * has been manually verified.
 *
 * Every query here uses the normal authenticated Supabase client (session
 * cookies from lib/supabase/server), never a service-role client -- the
 * whole point is to prove RLS blocks cross-customer access for the same
 * kind of client the real app uses, not to bypass it.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RlsTestState = {
  error?: string;
  otherUserId?: string;
  otherProfileRowsReturned?: number;
  otherCustomerProfileRowsReturned?: number;
  otherProfileUpdateRowsAffected?: number;
  otherCustomerProfileUpdateRowsAffected?: number;
  otherProfileReadBlocked?: boolean;
  otherCustomerProfileReadBlocked?: boolean;
  otherProfileUpdateBlocked?: boolean;
  otherCustomerProfileUpdateBlocked?: boolean;
};

export async function runRlsCrossUserTest(
  _prevState: RlsTestState,
  formData: FormData,
): Promise<RlsTestState> {
  if (process.env.NODE_ENV === "production") notFound();

  const otherUserId = String(formData.get("other_user_id") ?? "").trim();
  if (!UUID_PATTERN.test(otherUserId)) {
    return { error: "Enter a valid UUID (a profiles.id / auth.users.id value)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to run this test." };

  if (otherUserId === user.id) {
    return { error: "That's your own ID -- paste a different customer's ID to test isolation." };
  }

  // 1. Attempt to read the other customer's profiles row.
  const { data: otherProfileRows, error: profileReadError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", otherUserId);

  // 2. Attempt to read the other customer's customer_profiles row.
  const { data: otherCustomerProfileRows, error: customerProfileReadError } =
    await supabase.from("customer_profiles").select("id, user_id").eq("user_id", otherUserId);

  // 3. Attempt to overwrite the other customer's full_name. full_name is
  // an otherwise-writable column (unlike role/account_status), so if this
  // affects zero rows it's purely because the RLS row policy filtered the
  // WHERE clause down to nothing -- not a column-privilege error.
  const { data: profileUpdateRows, error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ full_name: "RLS TEST — SHOULD NOT PERSIST" })
    .eq("id", otherUserId)
    .select("id");

  // 4. Same for the other customer's current_role.
  const { data: customerProfileUpdateRows, error: customerProfileUpdateError } =
    await supabase
      .from("customer_profiles")
      .update({ current_role: "RLS TEST — SHOULD NOT PERSIST" })
      .eq("user_id", otherUserId)
      .select("id");

  const profileRowsReturned = otherProfileRows?.length ?? 0;
  const customerProfileRowsReturned = otherCustomerProfileRows?.length ?? 0;
  const profileUpdateRowsAffected = profileUpdateRows?.length ?? 0;
  const customerProfileUpdateRowsAffected = customerProfileUpdateRows?.length ?? 0;

  return {
    otherUserId,
    otherProfileRowsReturned: profileRowsReturned,
    otherCustomerProfileRowsReturned: customerProfileRowsReturned,
    otherProfileUpdateRowsAffected: profileUpdateRowsAffected,
    otherCustomerProfileUpdateRowsAffected: customerProfileUpdateRowsAffected,
    // Blocked = either an error was raised, or (far more likely under RLS,
    // which filters rows rather than erroring) zero rows were visible/affected.
    otherProfileReadBlocked: Boolean(profileReadError) || profileRowsReturned === 0,
    otherCustomerProfileReadBlocked:
      Boolean(customerProfileReadError) || customerProfileRowsReturned === 0,
    otherProfileUpdateBlocked:
      Boolean(profileUpdateError) || profileUpdateRowsAffected === 0,
    otherCustomerProfileUpdateBlocked:
      Boolean(customerProfileUpdateError) || customerProfileUpdateRowsAffected === 0,
  };
}
