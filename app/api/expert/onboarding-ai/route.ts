import { NextResponse, type NextRequest } from "next/server";
import { draftProfileAction, suggestChipsAction } from "@/lib/expert/onboarding/actions";
import { CHIP_STEPS, DRAFT_FIELDS, type ChipStep, type DraftField, type OnboardingAnswers } from "@/lib/expert/onboarding/answers";

/**
 * The guided onboarding's AI calls (answer chips and profile drafts).
 *
 * A route handler rather than server actions on purpose: Next runs a
 * page's server actions one at a time, so an AI call (2-15s) would wait
 * behind the card's background save and vice versa. Fetches run in
 * parallel. Auth, caps and fallbacks live in the functions called here,
 * which read the signed-in user from the request cookies.
 */
export async function POST(request: NextRequest) {
  // Same-origin only, like server actions: a page elsewhere can't spend an
  // expert's AI allowance.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { kind?: string; step?: string; field?: string; tweak?: string; answers?: OnboardingAnswers };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.answers || typeof body.answers !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (body.kind === "chips" && (CHIP_STEPS as readonly string[]).includes(body.step ?? "")) {
    return NextResponse.json(await suggestChipsAction(body.step as ChipStep, body.answers));
  }

  if (body.kind === "draft") {
    const field = (DRAFT_FIELDS as readonly string[]).includes(body.field ?? "") ? (body.field as DraftField) : undefined;
    const tweak = typeof body.tweak === "string" ? body.tweak.slice(0, 20) : undefined;
    return NextResponse.json(await draftProfileAction(body.answers, { field, tweak }));
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
