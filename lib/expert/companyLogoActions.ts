"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { invalidatePublicExperts } from "@/lib/public/cached";
import { COMPANY_LOGO_BUCKET, companiesOf, companyKey, readCompanyLogos } from "@/lib/expert/companyLogos";

type Result = { error?: string };

const GENERIC = "We couldn't save the logo. Please try again.";

/** The expert profile, if the caller is that expert or an admin. */
async function loadForEdit(expertProfileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." } as const;

  const [{ data: profile }, { data: me }] = await Promise.all([
    supabase
      .from("expert_profiles")
      .select("id, user_id, slug, current_company, experience, company_logos")
      .eq("id", expertProfileId)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const isAdmin = me?.role === "admin";
  if (!profile || (profile.user_id !== user.id && !isAdmin)) return { error: "Not authorized." } as const;
  return { supabase, profile, isAdmin } as const;
}

function refresh(slug: string | null, expertProfileId: string) {
  revalidatePath("/expert/application", "layout");
  revalidatePath(`/admin/experts/${expertProfileId}`);
  if (slug) revalidatePath(`/experts/${slug}`);
  invalidatePublicExperts();
}

/**
 * Records an uploaded logo for one of the expert's companies. The file was
 * uploaded by the browser under storage RLS; here we check it sits in that
 * expert's own folder and names one of their companies.
 */
export async function saveCompanyLogoAction(expertProfileId: string, company: string, path: string): Promise<Result> {
  const loaded = await loadForEdit(expertProfileId);
  if ("error" in loaded) return { error: loaded.error };
  const { supabase, profile } = loaded;

  const key = companyKey(company);
  const known = companiesOf(profile.current_company, profile.experience).map(companyKey);
  if (!key || !known.includes(key)) return { error: "That company isn't on this profile." };
  if (!path.startsWith(`${profile.user_id}/`) || path.includes("..")) return { error: GENERIC };

  const logos = readCompanyLogos(profile.company_logos);
  const previous = logos[key];
  logos[key] = path;
  const { error } = await supabase.from("expert_profiles").update({ company_logos: logos }).eq("id", profile.id);
  if (error) return { error: GENERIC };

  // The replaced file is no longer used.
  if (previous && previous !== path) await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([previous]);
  refresh(profile.slug, profile.id);
  return {};
}

export async function removeCompanyLogoAction(expertProfileId: string, company: string): Promise<Result> {
  const loaded = await loadForEdit(expertProfileId);
  if ("error" in loaded) return { error: loaded.error };
  const { supabase, profile } = loaded;

  const key = companyKey(company);
  const logos = readCompanyLogos(profile.company_logos);
  const previous = logos[key];
  if (!previous) return {};
  delete logos[key];
  const { error } = await supabase.from("expert_profiles").update({ company_logos: logos }).eq("id", profile.id);
  if (error) return { error: "We couldn't remove the logo. Please try again." };

  await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([previous]);
  refresh(profile.slug, profile.id);
  return {};
}
