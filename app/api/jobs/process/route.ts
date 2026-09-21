import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getWorkerSecret } from "@/lib/jobs/config";
import { runDueJobs } from "@/lib/jobs/worker";

/**
 * Protected job-processing endpoint (spec sections 90, 91). Never called
 * from the browser, never called from inside the confirmation
 * transaction (spec section 6) -- a scheduler (pg_cron+pg_net, or any
 * other cron mechanism) calls this over plain HTTP after a booking has
 * already been confirmed and committed. The shared secret is the only
 * authorization here: there is no Supabase user session on a
 * scheduler-triggered call, same reasoning as the Chapa webhook (spec
 * section 18's "webhook auth is provider signature validation only",
 * applied here as "worker auth is shared-secret validation only").
 */
export async function POST(request: NextRequest) {
  const provided = request.headers.get("x-worker-secret");
  if (!isValidSecret(provided)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runDueJobs();
  return NextResponse.json(summary, { status: 200 });
}

function isValidSecret(provided: string | null): boolean {
  if (!provided) return false;
  const expected = getWorkerSecret();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
