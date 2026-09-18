import { NextResponse, type NextRequest } from "next/server";
import { setChapaMockScenario, type ChapaMockScenario } from "@/lib/chapa/mockControl";

const VALID_SCENARIOS: ChapaMockScenario[] = [
  "success",
  "failed",
  "pending",
  "amount_mismatch",
  "currency_mismatch",
  "wrong_tx_ref",
  "init_error",
];

/**
 * Test-only control endpoint -- lets a Playwright test (a separate
 * process driving a browser against the running `next dev`/`next start`
 * server) set which scenario MockChapaClient (mock.ts) should simulate
 * on its next initialize/verify call, via a real HTTP round trip to this
 * same server process (module-level state in mockControl.ts persists
 * across requests within one process).
 *
 * 404s outside CHAPA_MODE=mock -- never reachable in production.
 */
export async function POST(request: NextRequest) {
  if (process.env.CHAPA_MODE !== "mock") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { scenario?: string } | null;
  const scenario = body?.scenario;

  if (!scenario || !VALID_SCENARIOS.includes(scenario as ChapaMockScenario)) {
    return NextResponse.json({ error: `scenario must be one of: ${VALID_SCENARIOS.join(", ")}` }, { status: 400 });
  }

  setChapaMockScenario(scenario as ChapaMockScenario);
  return NextResponse.json({ ok: true, scenario });
}
