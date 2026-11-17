"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { invalidatePublicExperts } from "@/lib/public/cached";
import {
  COMPANY_LOGO_BUCKET,
  companiesOf,
  companyKey,
  companyLogoUrl,
  readCompanyLogos,
  type LibraryMatch,
} from "@/lib/expert/companyLogos";

type Result = { error?: string };
export type LibraryCompany = LibraryMatch;

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
  return { supabase, userId: user.id, profile, isAdmin } as const;
}

function refresh(slug: string | null, expertProfileId: string) {
  revalidatePath("/expert/application", "layout");
  revalidatePath(`/admin/experts/${expertProfileId}`);
  if (slug) revalidatePath(`/experts/${slug}`);
  invalidatePublicExperts();
}

type Loaded = Exclude<Awaited<ReturnType<typeof loadForEdit>>, { error: string }>;

/** Points one of the expert's companies at a logo path, and deletes the
 * file it replaces unless that file belongs to the shared library. */
async function setLogo({ supabase, profile }: Loaded, company: string, path: string | null): Promise<Result> {
  const key = companyKey(company);
  const known = companiesOf(profile.current_company, profile.experience).map(companyKey);
  if (!key || !known.includes(key)) return { error: "That company isn't on this profile." };

  const logos = readCompanyLogos(profile.company_logos);
  const previous = logos[key];
  if (path) logos[key] = path;
  else delete logos[key];
  const { error } = await supabase.from("expert_profiles").update({ company_logos: logos }).eq("id", profile.id);
  if (error) return { error: GENERIC };

  if (previous && previous !== path) {
    const { data: shared } = await supabase.from("companies").select("id").eq("logo_path", previous).limit(1);
    if (!shared || shared.length === 0) await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([previous]);
  }
  refresh(profile.slug, profile.id);
  return {};
}

/** Library companies whose name contains the text (case-insensitive). */
export async function searchCompaniesAction(query: string): Promise<LibraryCompany[]> {
  const text = companyKey(query).slice(0, 80);
  if (text.length < 2) return [];
  const supabase = await createClient();
  const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data } = await supabase
    .from("companies")
    .select("id, name, logo_path")
    .ilike("name_key", pattern)
    .order("name")
    .limit(8);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, logoUrl: companyLogoUrl(row.logo_path) }));
}

/** Uses a library company's logo for one of the expert's companies (no upload). */
export async function applyLibraryLogoAction(
  expertProfileId: string,
  company: string,
  libraryCompanyId: string,
): Promise<Result> {
  const loaded = await loadForEdit(expertProfileId);
  if ("error" in loaded) return { error: loaded.error };
  const { data: library } = await loaded.supabase
    .from("companies")
    .select("logo_path")
    .eq("id", libraryCompanyId)
    .maybeSingle();
  if (!library) return { error: "That company is no longer in the library." };
  return setLogo(loaded, company, library.logo_path);
}

/**
 * Records a newly uploaded logo (the browser uploaded it under storage
 * RLS) and adds the company to the shared library, so the next expert from
 * that company just picks it. If the library already has that name, the
 * upload is used for this expert only.
 */
export async function saveCompanyLogoAction(expertProfileId: string, company: string, path: string): Promise<Result> {
  const loaded = await loadForEdit(expertProfileId);
  if ("error" in loaded) return { error: loaded.error };
  if (!path.startsWith(`${loaded.profile.user_id}/`) || path.includes("..")) return { error: GENERIC };

  const result = await setLogo(loaded, company, path);
  if (result.error) return result;

  const name = company.trim().replace(/\s+/g, " ");
  const key = companyKey(name);
  const { data: existing } = await loaded.supabase.from("companies").select("id").eq("name_key", key).maybeSingle();
  // Database rules (068) allow adding only a logo in the caller's own
  // folder, or any folder for an admin.
  if (!existing) {
    await loaded.supabase.from("companies").insert({ name, name_key: key, logo_path: path, created_by: loaded.userId });
  }
  return {};
}

export async function removeCompanyLogoAction(expertProfileId: string, company: string): Promise<Result> {
  const loaded = await loadForEdit(expertProfileId);
  if ("error" in loaded) return { error: loaded.error };
  return setLogo(loaded, company, null);
}
