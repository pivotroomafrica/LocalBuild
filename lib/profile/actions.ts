"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateCity,
  validateCompanyName,
  validateCountry,
  validateCurrentRole,
  validateEmploymentType,
  validateExperienceRange,
  validateFullName,
  validateLinkedinUrl,
  validateOptionalPhone,
} from "@/lib/validation/profile";

export type ProfileActionState = {
  error?: string;
  success?: boolean;
};

/**
 * Saves both the personal (profiles) and professional (customer_profiles)
 * sections of the profile page in one submit, matching the single "Save
 * Changes" button in the spec.
 *
 * Identity always comes from the authenticated session (user.id) -- never
 * from a client-submitted field -- so this cannot be used to edit anyone
 * else's data even if the request is crafted by hand.
 */
export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in to do that." };

  const fullName = validateFullName(String(formData.get("full_name") ?? ""));
  if (!fullName.valid) return { error: fullName.error };

  const phone = validateOptionalPhone(String(formData.get("phone") ?? ""));
  if (!phone.valid) return { error: phone.error };

  const country = validateCountry(String(formData.get("country") ?? ""));
  if (!country.valid) return { error: country.error };

  const city = validateCity(String(formData.get("city") ?? ""));
  if (!city.valid) return { error: city.error };

  const currentRole = validateCurrentRole(String(formData.get("current_role") ?? ""));
  if (!currentRole.valid) return { error: currentRole.error };

  const employmentType = validateEmploymentType(
    String(formData.get("employment_type") ?? ""),
  );
  if (!employmentType.valid) return { error: employmentType.error };

  const companyName = validateCompanyName(String(formData.get("company_name") ?? ""));
  if (!companyName.valid) return { error: companyName.error };

  const experienceRange = validateExperienceRange(
    String(formData.get("years_experience_range") ?? ""),
  );
  if (!experienceRange.valid) return { error: experienceRange.error };

  const linkedinUrl = validateLinkedinUrl(String(formData.get("linkedin_url") ?? ""));
  if (!linkedinUrl.valid) return { error: linkedinUrl.error };

  const industryId = String(formData.get("industry_id") ?? "").trim() || null;

  const genericError = "We couldn't save your changes. Please try again.";

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName.value,
      phone: phone.value,
      country: country.value,
      city: city.value,
    })
    .eq("id", user.id);

  if (profileError) return { error: genericError };

  const customerProfileFields = {
    current_role: currentRole.value,
    employment_type: employmentType.value,
    company_name: companyName.value,
    industry_id: industryId,
    years_experience_range: experienceRange.value,
    linkedin_url: linkedinUrl.value,
  };

  // Update first; only insert if no row exists yet. This keeps the "at
  // most one customer_profiles row per customer" guarantee intact without
  // touching the user_id column at all after creation (it is intentionally
  // excluded from the UPDATE column grant -- see
  // supabase/migrations/004_customer_rls.sql).
  const { data: updatedRows, error: updateError } = await supabase
    .from("customer_profiles")
    .update(customerProfileFields)
    .eq("user_id", user.id)
    .select("id");

  if (updateError) return { error: genericError };

  if (!updatedRows || updatedRows.length === 0) {
    const { error: insertError } = await supabase
      .from("customer_profiles")
      .insert({ user_id: user.id, ...customerProfileFields });

    // A unique-violation here means a concurrent request already created
    // the row (e.g. a doubled-up submit) -- that request's data was saved
    // successfully, so this is not a real failure.
    if (insertError && insertError.code !== "23505") {
      return { error: genericError };
    }
  }

  revalidatePath("/dashboard/profile");
  return { success: true };
}
