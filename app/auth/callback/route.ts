import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/utils/publicOrigin";
import { homePathFor, safeNext } from "@/lib/auth/home";

/**
 * Supabase email links (signup confirmation, password recovery) redirect
 * here with a `code` param instead of an active session. Exchanging it is
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
      // First time with Google: Google doesn't give us a phone number,
      // country or city, and they haven't ticked the terms yet, so ask
      // once before going on. (Password-reset links go straight through.)
      if (next !== "/auth/reset-password") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone, country, city, terms_accepted_at")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profile && (!profile.phone || !profile.country || !profile.city || !profile.terms_accepted_at)) {
          const finish = next ? `/auth/complete-profile?next=${encodeURIComponent(next)}` : "/auth/complete-profile";
          return NextResponse.redirect(`${origin}${finish}`);
        }
      }
      return NextResponse.redirect(`${origin}${next ?? (await homePathFor(supabase, data.user.id))}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login`);
}
