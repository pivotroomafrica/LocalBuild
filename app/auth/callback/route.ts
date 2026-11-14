import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/utils/publicOrigin";
import { homePathFor, safeNext } from "@/lib/auth/home";

/**
 * Supabase email links (signup confirmation, password recovery) and
 * "Continue with LinkedIn" redirect here with a `code` param instead of an
 * active session. Exchanging it is
 * what actually sets the auth cookies -- landing on a page directly with
 * the code still attached would leave the visitor unauthenticated.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const target = next ?? (await homePathFor(supabase, data.user.id));
      // Sign-in with LinkedIn shares no phone, country or city: ask once.
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, country, city")
        .eq("id", data.user.id)
        .maybeSingle();
      const viaLinkedIn = (data.user.app_metadata?.providers as string[] | undefined)?.includes("linkedin_oidc");
      if (viaLinkedIn && profile && (!profile.phone || !profile.country || !profile.city)) {
        return NextResponse.redirect(`${origin}/auth/complete-profile?next=${encodeURIComponent(target)}`);
      }
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  // A cancelled or failed "Continue with LinkedIn" comes back with ?error=.
  const failed = searchParams.get("error") ? "?error=oauth" : "";
  return NextResponse.redirect(`${origin}/auth/login${failed}`);
}
