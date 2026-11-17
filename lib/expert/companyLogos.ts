/**
 * Company logos (066): expert_profiles.company_logos maps a company key
 * (the name lower-cased and trimmed) to a file path in the public
 * 'company-logos' bucket, under '<expert user id>/'.
 */
export const COMPANY_LOGO_BUCKET = "company-logos";
export const COMPANY_LOGO_MAX_BYTES = 1024 * 1024;
export const COMPANY_LOGO_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];

export function companyKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Public URL of a logo file (the bucket is public). */
export function companyLogoUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${COMPANY_LOGO_BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** The stored map, defensively read (only string paths survive). */
export function readCompanyLogos(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, path] of Object.entries(value as Record<string, unknown>)) {
    if (typeof path === "string" && path) out[key] = path;
  }
  return out;
}

/** Every company the expert names: the current one first, then each
 * experience row's organisation, without repeats. */
export function companiesOf(currentCompany: string | null | undefined, experience: unknown): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: unknown) => {
    if (typeof name !== "string" || !name.trim()) return;
    const key = companyKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name.trim());
  };
  add(currentCompany);
  if (Array.isArray(experience)) for (const row of experience) add((row as { organization?: unknown })?.organization);
  return names;
}

export type LibraryMatch = { id: string; name: string; logoUrl: string };
