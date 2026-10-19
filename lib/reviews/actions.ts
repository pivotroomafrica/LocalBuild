"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminForAction } from "@/lib/admin/data";
import { invalidatePublicExperts } from "@/lib/public/cached";

export type ReviewActionState = { error?: string; success?: boolean };

/** Messages raised by submit_expert_review() (049b) are written for
 * customers, so they are shown as-is; anything else gets a generic one. */
const KNOWN_MESSAGES = [
  "Sign in to leave a review.",
  "Booking not found.",
  "You can review a session once it has taken place.",
  "Choose a rating from 1 to 5.",
  "Write between 10 and 1,000 characters.",
  "You have already reviewed this session.",
];

export async function submitReviewAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const reference = String(formData.get("booking_reference") ?? "");
  const rating = Number(formData.get("rating"));
  const body = String(formData.get("body") ?? "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose a star rating first." };
  if (body.length < 10) return { error: "Write at least a sentence about the session." };
  if (body.length > 1000) return { error: "Keep it under 1,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_expert_review", {
    p_booking_reference: reference,
    p_rating: rating,
    p_body: body,
  });
  if (error) {
    if (KNOWN_MESSAGES.includes(error.message)) return { error: error.message };
    console.error(`submitReviewAction: ${error.message}`);
    return { error: "We couldn't post your review. Please try again." };
  }

  // The profile's reviews, rating and Top expert badge read the public cache.
  invalidatePublicExperts();
  return { success: true };
}

/** Admin: hide or re-show a review (049b; RLS allows admins only). Used
 * as a plain form action on the admin expert page. */
export async function setReviewHiddenAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return;

  const reviewId = String(formData.get("review_id") ?? "");
  const hidden = formData.get("hidden") === "true";
  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!reviewId) return;

  const { error } = await supabase
    .from("expert_reviews")
    .update({ is_hidden: hidden, hidden_by: hidden ? auth.admin.id : null, updated_at: new Date().toISOString() })
    .eq("id", reviewId);
  if (error) {
    console.error(`setReviewHiddenAction: ${error.message}`);
    return;
  }

  invalidatePublicExperts();
  if (expertProfileId) revalidatePath(`/admin/experts/${expertProfileId}`);
}
