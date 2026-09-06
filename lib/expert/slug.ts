/**
 * Turns a display name into a URL-safe slug base. Collision handling
 * (appending -2, -3, ...) happens where the insert actually runs (see
 * ensureExpertProfileDraft in lib/expert/actions.ts) by retrying on the
 * database's unique-violation error, NOT by querying existing slugs first
 * -- RLS means an applicant's client can only ever see their own
 * expert_profiles row, so a pre-check SELECT would never see other
 * applicants' slugs and couldn't actually detect a collision.
 */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents left over from NFKD decomposition
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "expert";
}
