import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** www.<domain> -> <domain>, keeping the path and query, so there is one
 * address (sign-in cookies only live on one host). Done here because the
 * hosting panel's redirect doesn't reach paths served by the Node app. */
function wwwRedirect(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  if (!host.toLowerCase().startsWith("www.")) return null;
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(`https://${host.slice(4)}${pathname}${search}`, 308);
}

export function proxy(request: NextRequest) {
  return wwwRedirect(request) ?? updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request except static assets and image optimization
     * files, so the auth session cookie stays fresh across navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
