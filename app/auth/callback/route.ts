import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError, type EmailOtpType } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicOrigin } from "@/lib/utils/publicOrigin";
import { homePathFor, safeNext } from "@/lib/auth/home";

/** The session cookie itself and its chunks (`.0`, `.1`, ...), but not the
 * PKCE verifier cookies, which end in `-code-verifier`. */
const SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/;

/**
 * Google / LinkedIn sign-in and Supabase email links (signup confirmation,
 * password recovery) come back here with a one-time `code`. Exchanging it
 * is what sets the auth cookies.
 *
 * The exchange uses a client that does NOT see any existing session
 * cookies: a stale or half-deleted session (e.g. a leftover chunk) makes
 * the Supabase client tear the session down on start-up, and that also
 * deletes the PKCE code verifier -- the exchange then fails without ever
 * reaching Supabase and the visitor lands back on "Welcome back". The new
 * session replaces any old one, and leftover session chunks are cleared.
 * A network drop on the exchange is retried once; any failure is logged
 * with its reason and the visitor sees "didn't finish, please try again".
 *
 * Account emails (supabase/templates) link here on pivotroom.africa with a
 * `token_hash` instead: verified directly, so the link also works when it
 * is opened on another device or browser than the one that signed up.
 * `redirect_to` carries the page they were heading for.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");
  const next = safeNext(searchParams.get("next") ?? nextFromRedirect(searchParams.get("redirect_to")));
  // Set by supabase-js on the redirect: picks this attempt's own verifier.
  const flowId = searchParams.get("sb_flow_id") ?? undefined;

  if (code || (tokenHash && isEmailOtpType(otpType))) {
    const cookieStore = await cookies();
    // The cookies as they arrived, minus any old session. Each client starts
    // from this, so a retry still has the code verifier (a failed attempt
    // deletes it).
    const arrived = cookieStore.getAll().filter((cookie) => !SESSION_COOKIE.test(cookie.name));
    const written = new Set<string>();
    const makeClient = () =>
      createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
          getAll() {
            return arrived;
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              written.add(name);
              cookieStore.set(name, value, options);
            });
          },
        },
      });

    const options = flowId ? { flowId } : undefined;
    const attempt = (client: ReturnType<typeof makeClient>) =>
      code
        ? client.auth.exchangeCodeForSession(code, options)
        : client.auth.verifyOtp({ token_hash: tokenHash!, type: otpType as EmailOtpType });
    let supabase = makeClient();
    let { data, error } = await attempt(supabase);
    // A dropped connection to Supabase (it happens on slow networks): try
    // once more, on a fresh client, before giving up.
    if (error && isAuthRetryableFetchError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      supabase = makeClient();
      ({ data, error } = await attempt(supabase));
    }
    const user = error ? null : data.user;
    if (user) {
      // Clear pieces of an older session the new one didn't overwrite, so
      // they can't be glued onto the new session cookie.
      for (const cookie of cookieStore.getAll()) {
        if (SESSION_COOKIE.test(cookie.name) && !written.has(cookie.name)) cookieStore.delete(cookie.name);
      }

      // First time with Google: Google doesn't give us a phone number,
      // country or city, and they haven't ticked the terms yet, so ask
      // once before going on. (Password-reset links go straight through.)
      if (next !== "/auth/reset-password") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone, country, city, terms_accepted_at")
          .eq("id", user.id)
          .maybeSingle();
        if (profile && (!profile.phone || !profile.country || !profile.city || !profile.terms_accepted_at)) {
          const finish = next ? `/auth/complete-profile?next=${encodeURIComponent(next)}` : "/auth/complete-profile";
          return NextResponse.redirect(`${origin}${finish}`);
        }
      }
      return NextResponse.redirect(`${origin}${next ?? (await homePathFor(supabase, user.id))}`);
    }
    console.error(`auth/callback: ${code ? "code exchange" : "email link"} failed: ${error?.name ?? "no user"}: ${error?.message ?? ""}`);
  }

  // Cancelled or failed: back to sign-in with a message, keeping where
  // they were heading (e.g. the expert they were booking).
  const params = new URLSearchParams({ error: "oauth" });
  if (next) params.set("next", next);
  return NextResponse.redirect(`${origin}/auth/login?${params.toString()}`);
}

const EMAIL_OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "email_change", "invite", "magiclink"];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as string[]).includes(value);
}

/** The `next` path inside the redirect URL an account email carries
 * (`.../auth/callback?next=/expert/...`), or null. */
function nextFromRedirect(redirectTo: string | null): string | null {
  if (!redirectTo) return null;
  try {
    return new URL(redirectTo).searchParams.get("next");
  } catch {
    return null;
  }
}
