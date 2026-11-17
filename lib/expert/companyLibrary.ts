import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { companyKey, companyLogoUrl, type LibraryMatch } from "@/lib/expert/companyLogos";

/** Library companies with exactly these names (by company key), so the
 * logo editor can offer "Use this logo" without a search. */
export async function libraryMatchesFor(
  supabase: SupabaseClient<Database>,
  companies: string[],
): Promise<Record<string, LibraryMatch>> {
  const keys = Array.from(new Set(companies.map(companyKey))).filter(Boolean);
  if (keys.length === 0) return {};
  const { data } = await supabase.from("companies").select("id, name, name_key, logo_path").in("name_key", keys);
  return Object.fromEntries(
    (data ?? []).map((row) => [row.name_key, { id: row.id, name: row.name, logoUrl: companyLogoUrl(row.logo_path) }]),
  );
}
