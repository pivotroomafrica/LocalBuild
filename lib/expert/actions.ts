"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/expert/slug";
import { getExpertApplicationData, getMissingRequiredFields } from "@/lib/expert/data";
import {
  validateCareerHighlights,
  validateCurrentCompany,
  validateCurrentPosition,
  validateExpertCity,
  validateExpertCountry,
  validateExpertExperienceRange,
  validateExpertLinkedinUrl,
  validateExpertiseSummary,
  validateHeadline,
  validateProblemsHelpWith,
  validateShortBio,
  validateWhoIHelp,
  validateBasePrice,
  validateSessionDuration,
  validateSessionFormat,
} from "@/lib/validation/expert";
import { MAX_EXPERT_CATEGORIES } from "@/types/expert";
import type { ExpertProfile } from "@/types/expert";

const GENERIC_ERROR = "We couldn't save your changes. Please try again.";

/**
 * Get-or-create the current user's expert_profiles draft. Idempotent and
 * safe to call on every visit to an /expert/application/* page: if a row
 * already exists it's returned as-is (no duplicate is possible -- the
 * unique constraint on user_id guarantees that even under a race, see the
 * 23505 handling below), matching the "no duplicate expert profile" rule
 * from the spec (Phase 2 TEST E).
 *
 * profiles.role is never touched here or anywhere else in this file --
 * an application's existence, not a role value, is what represents
 * "this user is an applicant."
 */
export async function ensureExpertProfileDraft(): Promise<ExpertProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/expert/application");

  const { data: existing } = await supabase
    .from("expert_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return existing;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const baseSlug = slugify(profile?.full_name ?? "expert");

  // Try the base slug, then base-2, base-3, ... A pre-check SELECT for
  // "is this slug taken" would not work here: RLS limits this client to
  // seeing only its own expert_profiles row, so it could never see
  // another applicant's slug to detect a collision. Racing the insert
  // itself and reacting to the unique-violation is the only correct way
  // under RLS.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    const { data: inserted, error } = await supabase
      .from("expert_profiles")
      .insert({ user_id: user.id, slug: candidateSlug })
      .select("*")
      .single();

    if (!error) return inserted;

    if (error.code === "23505") {
      // Which unique constraint fired: user_id means a concurrent request
      // already created this user's draft (re-fetch and return it, not
      // an error); slug means try the next candidate.
      if (error.message.includes("expert_profiles_user_id_key") || error.message.includes("user_id")) {
        const { data: raceWinner } = await supabase
          .from("expert_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (raceWinner) return raceWinner;
      }
      continue;
    }

    throw new Error(GENERIC_ERROR);
  }

  throw new Error(GENERIC_ERROR);
}

export type ExpertActionState = {
  error?: string;
  success?: boolean;
  missingFields?: string[];
};

export async function updateExpertProfileAction(
  _prevState: ExpertActionState,
  formData: FormData,
): Promise<ExpertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const headline = validateHeadline(String(formData.get("headline") ?? ""));
  if (!headline.valid) return { error: headline.error };

  const currentPosition = validateCurrentPosition(String(formData.get("current_position") ?? ""));
  if (!currentPosition.valid) return { error: currentPosition.error };

  const currentCompany = validateCurrentCompany(String(formData.get("current_company") ?? ""));
  if (!currentCompany.valid) return { error: currentCompany.error };

  const experienceRange = validateExpertExperienceRange(
    String(formData.get("years_experience_range") ?? ""),
  );
  if (!experienceRange.valid) return { error: experienceRange.error };

  const linkedinUrl = validateExpertLinkedinUrl(String(formData.get("linkedin_url") ?? ""));
  if (!linkedinUrl.valid) return { error: linkedinUrl.error };

  const country = validateExpertCountry(String(formData.get("country") ?? ""));
  if (!country.valid) return { error: country.error };

  const city = validateExpertCity(String(formData.get("city") ?? ""));
  if (!city.valid) return { error: city.error };

  const shortBio = validateShortBio(String(formData.get("short_bio") ?? ""));
  if (!shortBio.valid) return { error: shortBio.error };

  const expertiseSummary = validateExpertiseSummary(String(formData.get("expertise_summary") ?? ""));
  if (!expertiseSummary.valid) return { error: expertiseSummary.error };

  const problemsHelpWith = validateProblemsHelpWith(String(formData.get("problems_help_with") ?? ""));
  if (!problemsHelpWith.valid) return { error: problemsHelpWith.error };

  const whoIHelp = validateWhoIHelp(String(formData.get("who_i_help") ?? ""));
  if (!whoIHelp.valid) return { error: whoIHelp.error };

  const careerHighlights = validateCareerHighlights(String(formData.get("career_highlights") ?? ""));
  if (!careerHighlights.valid) return { error: careerHighlights.error };

  const { error } = await supabase
    .from("expert_profiles")
    .update({
      headline: headline.value,
      current_position: currentPosition.value,
      current_company: currentCompany.value,
      years_experience_range: experienceRange.value,
      linkedin_url: linkedinUrl.value,
      country: country.value,
      city: city.value,
      short_bio: shortBio.value,
      expertise_summary: expertiseSummary.value,
      problems_help_with: problemsHelpWith.value,
      who_i_help: whoIHelp.value,
      career_highlights: careerHighlights.value,
    })
    .eq("user_id", user.id);

  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/expert/application");
  revalidatePath("/expert/application/profile");
  return { success: true };
}

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // matches the bucket's file_size_limit

export async function uploadExpertPhotoAction(
  _prevState: ExpertActionState,
  formData: FormData,
): Promise<ExpertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a photo to upload." };
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return { error: "Please upload a JPG, PNG or WebP image." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "This image is too large. Please choose a smaller image." };
  }

  const path = `${user.id}/profile-photo`;
  const { error: uploadError } = await supabase.storage
    .from("expert-profile-images")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: "We couldn't upload your photo. Please try again." };

  const { error: updateError } = await supabase
    .from("expert_profiles")
    .update({ profile_image_path: path })
    .eq("user_id", user.id);

  if (updateError) return { error: "We couldn't upload your photo. Please try again." };

  revalidatePath("/expert/application");
  revalidatePath("/expert/application/profile");
  return { success: true };
}

export async function setExpertCategoriesAction(
  _prevState: ExpertActionState,
  formData: FormData,
): Promise<ExpertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const selectedIds = formData.getAll("category_ids").map(String).filter(Boolean);
  const uniqueSelectedIds = Array.from(new Set(selectedIds));

  if (uniqueSelectedIds.length > MAX_EXPERT_CATEGORIES) {
    return { error: `Select at most ${MAX_EXPERT_CATEGORIES} expertise categories.` };
  }

  const { data: expertProfile } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!expertProfile) return { error: GENERIC_ERROR };

  const { data: existingLinks } = await supabase
    .from("expert_profile_categories")
    .select("id, category_id")
    .eq("expert_profile_id", expertProfile.id);

  const existingIds = new Set((existingLinks ?? []).map((row) => row.category_id));
  const toAdd = uniqueSelectedIds.filter((id) => !existingIds.has(id));
  const toRemove = (existingLinks ?? []).filter((row) => !uniqueSelectedIds.includes(row.category_id));

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("expert_profile_categories")
      .delete()
      .in("id", toRemove.map((row) => row.id));
    if (deleteError) return { error: GENERIC_ERROR };
  }

  if (toAdd.length > 0) {
    const { error: insertError } = await supabase.from("expert_profile_categories").insert(
      toAdd.map((categoryId) => ({
        expert_profile_id: expertProfile.id,
        category_id: categoryId,
      })),
    );
    if (insertError) {
      return {
        error:
          insertError.message.includes("at most 3")
            ? `Select at most ${MAX_EXPERT_CATEGORIES} expertise categories.`
            : GENERIC_ERROR,
      };
    }
  }

  revalidatePath("/expert/application");
  revalidatePath("/expert/application/expertise");
  return { success: true };
}

export async function addSessionOfferingAction(
  _prevState: ExpertActionState,
  formData: FormData,
): Promise<ExpertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const duration = validateSessionDuration(Number(formData.get("duration_minutes")));
  if (!duration.valid) return { error: duration.error };

  const price = validateBasePrice(String(formData.get("base_price") ?? ""));
  if (!price.valid) return { error: price.error };

  const onlineEnabled = formData.get("online_enabled") === "on";
  const inPersonEnabled = formData.get("in_person_enabled") === "on";
  const format = validateSessionFormat(onlineEnabled, inPersonEnabled);
  if (!format.valid) return { error: format.error };

  const { data: expertProfile } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!expertProfile) return { error: GENERIC_ERROR };

  const { error } = await supabase.from("expert_session_types").insert({
    expert_profile_id: expertProfile.id,
    duration_minutes: duration.value,
    base_price: price.value,
    currency: "ETB",
    online_enabled: onlineEnabled,
    in_person_enabled: inPersonEnabled,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `You already have a ${duration.value}-minute offering.` };
    }
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/expert/application");
  revalidatePath("/expert/application/sessions");
  return { success: true };
}

export async function updateSessionOfferingAction(
  _prevState: ExpertActionState,
  formData: FormData,
): Promise<ExpertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const offeringId = String(formData.get("offering_id") ?? "");
  if (!offeringId) return { error: GENERIC_ERROR };

  const price = validateBasePrice(String(formData.get("base_price") ?? ""));
  if (!price.valid) return { error: price.error };

  const onlineEnabled = formData.get("online_enabled") === "on";
  const inPersonEnabled = formData.get("in_person_enabled") === "on";
  const format = validateSessionFormat(onlineEnabled, inPersonEnabled);
  if (!format.valid) return { error: format.error };

  // RLS (expert_session_types_update_own) already restricts this to rows
  // whose expert_profile belongs to the caller -- no need to re-derive
  // and filter by expert_profile_id, ownership is enforced at the
  // database, not just by omission from the UI.
  const { error } = await supabase
    .from("expert_session_types")
    .update({
      base_price: price.value,
      online_enabled: onlineEnabled,
      in_person_enabled: inPersonEnabled,
    })
    .eq("id", offeringId);

  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/expert/application");
  revalidatePath("/expert/application/sessions");
  return { success: true };
}

export async function deleteSessionOfferingAction(
  _prevState: ExpertActionState,
  formData: FormData,
): Promise<ExpertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const offeringId = String(formData.get("offering_id") ?? "");
  if (!offeringId) return { error: GENERIC_ERROR };

  const { error } = await supabase.from("expert_session_types").delete().eq("id", offeringId);
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/expert/application");
  revalidatePath("/expert/application/sessions");
  return { success: true };
}

// Signature is fixed by useActionState (prevState, formData) even though
// this action needs neither -- submission reads the applicant's own
// already-saved data server-side rather than trusting any form payload.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function submitApplicationAction(
  _prevState: ExpertActionState,
  _formData: FormData,
): Promise<ExpertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const data = await getExpertApplicationData(supabase, user.id);
  if (!data) return { error: GENERIC_ERROR };

  const missingFields = getMissingRequiredFields(data);
  if (missingFields.length > 0) {
    return {
      error: "Your application is missing some required information.",
      missingFields,
    };
  }

  // application_status/profile_status are the only privileged columns
  // this action ever writes, and only to the one legitimate value each
  // (submitted / ready) -- protect_expert_profile_privileged_fields() in
  // 010_expert_rls.sql is what actually enforces that this can never
  // become approved/rejected/published/suspended from client code, not
  // this application-layer check alone.
  const { error } = await supabase
    .from("expert_profiles")
    .update({ application_status: "submitted", profile_status: "ready" })
    .eq("user_id", user.id);

  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/expert/application");
  return { success: true };
}
