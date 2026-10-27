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
      return NextResponse.redirect(`${origin}${next ?? (await homePathFor(supabase, data.user.id))}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login`);
}
