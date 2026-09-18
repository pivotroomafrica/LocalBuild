import { NextResponse, type NextRequest } from "next/server";

/**
 * Test-only fake "Chapa checkout" -- stands in for the real
 * checkout.chapa.co page a customer would otherwise be redirected to.
 * Immediately redirects to the booking's real return_url, simulating an
 * instantly-completed checkout so a Playwright test can exercise the
 * initialize -> redirect -> return -> verify -> finalize boundary without
 * any real payment UI to drive.
 *
 * 404s outside CHAPA_MODE=mock (never reachable in production, even by
 * accident -- there is no code path that sets CHAPA_MODE=mock outside
 * the Playwright test environment).
 */
export async function GET(request: NextRequest) {
  if (process.env.CHAPA_MODE !== "mock") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const returnUrl = request.nextUrl.searchParams.get("return_url");
  if (!returnUrl) {
    return NextResponse.json({ error: "missing return_url" }, { status: 400 });
  }

  return NextResponse.redirect(returnUrl);
}
