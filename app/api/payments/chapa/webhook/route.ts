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

  const outcome = await verifyAndFinalizeChapaTransaction(txRef);

  if (outcome.error) {
    // Chapa's own Verify API call (or our finalize RPC) failed -- a
    // non-2xx response tells Chapa to retry this delivery later, which
    // is the correct behavior (spec section 34: idempotent, safe to
    // receive the same event many times).
    console.error("Chapa webhook: finalize failed", { txRef, error: outcome.error });
    return NextResponse.json({ error: "processing failed, will retry" }, { status: 502 });
  }

  console.info("Chapa webhook processed", {
    txRef,
    finalPaymentStatus: outcome.finalPaymentStatus,
    finalBookingStatus: outcome.finalBookingStatus,
    newlyFinalized: outcome.newlyFinalized,
  });

  return NextResponse.json({ received: true, status: outcome.finalPaymentStatus }, { status: 200 });
}
