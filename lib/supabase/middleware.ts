import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/auth/reset-password", "/dev", "/expert"];
const AUTH_PREFIXES = ["/auth/login", "/auth/signup"];

/**
 * Refreshes the Supabase auth session on every request and enforces route
 * protection. Called from proxy.ts (Next.js 16's renamed middleware
 * convention). This is the source of truth for authentication state — the
 * app must not rely on client-only React state to decide access.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run any logic between createServerClient and
  // supabase.auth.getUser() — it must run to refresh the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const isAuthPage = AUTH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!user && isProtected) {
    const redirectUrl = new URL("/auth/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage) {
    // Preserve an intended destination (e.g. /become-an-expert -> Apply
    // sends an already-logged-in visitor here with ?next=/expert/application)
    // instead of always bouncing to /dashboard/profile.
    const rawNext = request.nextUrl.searchParams.get("next");
    const next = rawNext && rawNext.startsWith("/") ? rawNext : "/dashboard/profile";
    return NextResponse.redirect(new URL(next, request.url));
  }

  return supabaseResponse;
}
