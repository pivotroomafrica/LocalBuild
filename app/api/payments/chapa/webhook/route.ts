import { NextResponse, type NextRequest } from "next/server";
import { verifyChapaWebhookSignature } from "@/lib/chapa/signature";
import { verifyAndFinalizeChapaTransaction } from "@/lib/chapa/verify";

/**
 * Chapa webhook (spec section 18) -- public, but "public does not mean
 * public trust" (spec section 54): authenticated by the provider
 * signature only, never Supabase user auth (there is no user session on
 * a server-to-server call).
 *
 * The raw body is read via request.text() BEFORE any JSON.parse (spec
 * section 20) -- signature verification hashes those exact bytes;
 * parsing first and re-serializing would silently invalidate a
 * legitimate signature.
 *
 * The webhook body's own `status`/`amount`/`tx_ref` fields are used for
 * exactly one thing: knowing WHICH tx_ref to look up. The actual
 * finalize decision always goes through verifyAndFinalizeChapaTransaction,
 * which independently re-verifies with Chapa's API (spec sections 17,
 * 21, 54-55) -- never trusts this payload's own status field.
 *
 * This is the "Webhooks" delivery configured in the Chapa merchant
 * dashboard (Settings -> Webhooks, with its own secret hash) -- signed,
 * so it's the only entry point that gets a signature check.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-chapa-signature");

  if (!verifyChapaWebhookSignature(rawBody, signature)) {
    console.warn("Chapa webhook: invalid or missing signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let parsed: { tx_ref?: string } | null = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const txRef = parsed?.tx_ref;
  if (!txRef || typeof txRef !== "string") {
    return NextResponse.json({ error: "missing tx_ref" }, { status: 400 });
  }

  return finalizeAndRespond(txRef, "POST webhook");
}

/**
 * Real-world discovery during Phase 8 live testing (not documented in the
 * third-party SDK material this integration was originally built against,
 * since Chapa's own official docs were unreachable from the original
 * build sandbox): the `callback_url` passed at initialize time is pinged
 * by Chapa as a plain, unsigned GET with `trx_ref`/`ref_id`/`status` query
 * params -- a DIFFERENT delivery from the signed POST "Webhooks" dashboard
 * feature above. This is the mechanism that can reach Pivotroom even if
 * the customer closes their browser before the return_url redirect fires
 * (spec section 18's "critical" requirement), so it has to be handled,
 * not just 405'd.
 *
 * Safe without a signature for the same reason the return route (also
 * unauthenticated) is safe: the query string's own `status` is NEVER
 * trusted (spec sections 17, 55) -- only used to know which tx_ref to ask
 * Chapa's real Verify Transaction API about. A caller who merely knows or
 * guesses a tx_ref can trigger a re-check, never a false confirmation --
 * finalize_chapa_payment() (043) only ever moves state based on what
 * Chapa's own API independently reports.
 */
export async function GET(request: NextRequest) {
  const txRef = request.nextUrl.searchParams.get("trx_ref") ?? request.nextUrl.searchParams.get("tx_ref");
  if (!txRef) {
    return NextResponse.json({ error: "missing tx_ref" }, { status: 400 });
  }

  return finalizeAndRespond(txRef, "GET callback");
}

async function finalizeAndRespond(txRef: string, source: string): Promise<NextResponse> {
  const outcome = await verifyAndFinalizeChapaTransaction(txRef);

  if (outcome.error) {
    // Chapa's own Verify API call (or our finalize RPC) failed -- a
    // non-2xx response tells Chapa to retry this delivery later, which
    // is the correct behavior (spec section 34: idempotent, safe to
    // receive the same event many times).
    console.error("Chapa webhook: finalize failed", { txRef, source, error: outcome.error });
    return NextResponse.json({ error: "processing failed, will retry" }, { status: 502 });
  }

  console.info("Chapa webhook processed", {
    txRef,
    source,
    finalPaymentStatus: outcome.finalPaymentStatus,
    finalBookingStatus: outcome.finalBookingStatus,
    newlyFinalized: outcome.newlyFinalized,
  });

  return NextResponse.json({ received: true, status: outcome.finalPaymentStatus }, { status: 200 });
}
