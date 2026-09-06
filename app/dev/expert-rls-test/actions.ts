"use server";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * TEMPORARY LOCAL DEVELOPMENT ONLY. See app/dev/expert-rls-test/page.tsx.
 * Delete this file together with app/dev/expert-rls-test/ once Phase 2
 * RLS has been manually verified. Every query uses the normal
 * authenticated Supabase client (session cookies), never a service-role
 * client -- service role bypasses RLS and would make this test invalid.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CrossApplicantTestState = {
  error?: string;
  otherProfileReadBlocked?: boolean;
  otherProfileUpdateBlocked?: boolean;
  otherCategoryInsertBlocked?: boolean;
  otherSessionUpdateBlocked?: boolean;
};

export async function runCrossApplicantTest(
  _prevState: CrossApplicantTestState,
  formData: FormData,
): Promise<CrossApplicantTestState> {
  if (process.env.NODE_ENV === "production") notFound();

  const otherUserId = String(formData.get("other_user_id") ?? "").trim();
  const otherExpertProfileId = String(formData.get("other_expert_profile_id") ?? "").trim();

  if (!UUID_PATTERN.test(otherUserId) || !UUID_PATTERN.test(otherExpertProfileId)) {
    return {
      error:
        "Enter both the other applicant's user ID and their expert_profiles.id (find both in the Supabase dashboard Table Editor).",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to run this test." };

  if (otherUserId === user.id) {
    return { error: "That's your own user ID -- paste another applicant's ID to test isolation." };
  }

  const { data: otherProfileRows, error: readError } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", otherUserId);

  const { data: updateRows, error: updateError } = await supabase
    .from("expert_profiles")
    .update({ headline: "RLS TEST — SHOULD NOT PERSIST" })
    .eq("user_id", otherUserId)
    .select("id");

  // Any active category works here -- what's being tested is whether the
  // insert is accepted for someone else's expert_profile_id at all, not
  // which category.
  const { data: anyCategory } = await supabase
    .from("expert_categories")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let categoryInsertBlocked = true;
  if (anyCategory) {
    const { error: categoryError } = await supabase.from("expert_profile_categories").insert({
      expert_profile_id: otherExpertProfileId,
      category_id: anyCategory.id,
    });
    categoryInsertBlocked = Boolean(categoryError);
    // Clean up on the extremely-not-expected chance it succeeded, so this
    // diagnostic tool doesn't itself leave bad data behind.
    if (!categoryError) {
      await supabase
        .from("expert_profile_categories")
        .delete()
        .eq("expert_profile_id", otherExpertProfileId)
        .eq("category_id", anyCategory.id);
    }
  }

  const { data: sessionUpdateRows, error: sessionUpdateError } = await supabase
    .from("expert_session_types")
    .update({ base_price: 1 })
    .eq("expert_profile_id", otherExpertProfileId)
    .select("id");

  return {
    otherProfileReadBlocked: Boolean(readError) || (otherProfileRows?.length ?? 0) === 0,
    otherProfileUpdateBlocked: Boolean(updateError) || (updateRows?.length ?? 0) === 0,
    otherCategoryInsertBlocked: categoryInsertBlocked,
    otherSessionUpdateBlocked:
      Boolean(sessionUpdateError) || (sessionUpdateRows?.length ?? 0) === 0,
  };
}

export type SelfEscalationTestState = {
  selfApprovalBlocked?: boolean;
  selfPublishBlocked?: boolean;
  selfRoleEscalationBlocked?: boolean;
  error?: string;
};

// Signature is fixed by useActionState (prevState, formData); this test
// needs neither -- it always operates on the caller's own row.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function runSelfEscalationTest(
  _prevState: SelfEscalationTestState,
  _formData: FormData,
): Promise<SelfEscalationTestState> {
  if (process.env.NODE_ENV === "production") notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to run this test." };

  const { data: before } = await supabase
    .from("expert_profiles")
    .select("application_status, profile_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!before) {
    return { error: "You need an expert application draft first -- visit /expert/application." };
  }

  await supabase
    .from("expert_profiles")
    .update({ application_status: "approved" })
    .eq("user_id", user.id);
  const { data: afterApproval } = await supabase
    .from("expert_profiles")
    .select("application_status")
    .eq("user_id", user.id)
    .single();

  await supabase
    .from("expert_profiles")
    .update({ profile_status: "published" })
    .eq("user_id", user.id);
  const { data: afterPublish } = await supabase
    .from("expert_profiles")
    .select("profile_status")
    .eq("user_id", user.id)
    .single();

  // role escalation: same hard-denial-at-the-grant-level check as Phase 1.
  const { error: roleError } = await supabase
    .from("profiles")
    .update({ role: "expert" })
    .eq("id", user.id);

  return {
    selfApprovalBlocked: afterApproval?.application_status !== "approved",
    selfPublishBlocked: afterPublish?.profile_status !== "published",
    selfRoleEscalationBlocked: Boolean(roleError),
  };
}
