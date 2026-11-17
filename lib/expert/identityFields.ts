import { checkListedCity } from "@/lib/geo/cityCheck";
import { parseIdentityFields } from "@/lib/expert/profileFields";

/**
 * parseIdentityFields, plus: the city must be one from the country's list.
 * Server-only (reads the city lists from disk), so it lives apart from
 * profileFields, which browser code imports too.
 */
export async function parseIdentityFieldsChecked(formData: FormData) {
  const parsed = parseIdentityFields(formData);
  if (!parsed.ok) return parsed;
  const listed = await checkListedCity(parsed.update.country, parsed.update.city);
  if ("error" in listed) return { ok: false as const, error: listed.error };
  return { ok: true as const, update: { ...parsed.update, city: listed.city } };
}
