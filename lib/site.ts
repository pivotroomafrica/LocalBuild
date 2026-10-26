/** The public production domain. Anything else (staging, local) is kept
 * out of search engines and doesn't run the email/job queue by default. */
const PRODUCTION_HOSTS = new Set(["pivotroom.africa", "www.pivotroom.africa"]);

export function siteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return url || null;
}

export function isProductionSite(): boolean {
  const url = siteUrl();
  if (!url) return false;
  try {
    return PRODUCTION_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
