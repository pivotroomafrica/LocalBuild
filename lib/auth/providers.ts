/**
 * Which "Continue with ..." providers are switched on in Supabase
 * (Authentication -> Providers). Read from the public auth settings so a
 * button only appears once its provider is configured; cached briefly.
 */
export type OAuthProviders = { linkedin: boolean };

export async function getOAuthProviders(): Promise<OAuthProviders> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { linkedin: false };
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
    });
    if (!response.ok) return { linkedin: false };
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return { linkedin: settings.external?.linkedin_oidc === true };
  } catch {
    return { linkedin: false };
  }
}
