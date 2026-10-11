"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { describeSupabaseError } from "@/lib/supabase/errors";
import { getDirectoryForRequest } from "@/lib/public/cached";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { loadMatchCandidates } from "./candidates";
import { keywordRank } from "./keyword";
import { rankWithOpenAI } from "./openai";
import {
  getMatchLimits,
  getMatchModel,
  getOpenAIKey,
  getTokenPricesUsd,
  MATCH_MAX_CANDIDATES,
  MATCH_MAX_RESULTS,
  MATCH_PROBLEM_MAX_CHARS,
  MATCH_PROBLEM_MIN_CHARS,
} from "./config";

export type MatchResult = { expert: PublicDirectoryCard; reason: string };

export type MatchState = {
  status: "idle" | "done" | "error";
  /** "ai": ranked by the model. "keyword": the fallback ranking. */
  mode?: "ai" | "keyword";
  results?: MatchResult[];
  notice?: string;
  error?: string;
  problem?: string;
};

type Outcome = "ai" | "fallback_no_key" | "fallback_error" | "rate_limited";

/** Salted hash of the caller's IP: enough to rate-limit, never stored raw. */
async function clientKeyHash(): Promise<string> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip")?.trim() || "unknown";
  const salt = process.env.AI_MATCH_RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "pivotroom";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** True when this visitor or the whole site is over its AI-call limits.
 * Counting failures don't block matching (keyword results still work). */
async function isOverLimit(clientKey: string): Promise<boolean> {
  try {
    const service = createServiceRoleClient();
    const limits = getMatchLimits();
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: perClient }, { count: sitewide }] = await Promise.all([
      service
        .from("ai_match_requests")
        .select("id", { count: "exact", head: true })
        .eq("client_key_hash", clientKey)
        .eq("outcome", "ai")
        .gte("created_at", hourAgo),
      service
        .from("ai_match_requests")
        .select("id", { count: "exact", head: true })
        .eq("outcome", "ai")
        .gte("created_at", dayAgo),
    ]);
    return (perClient ?? 0) >= limits.perClientPerHour || (sitewide ?? 0) >= limits.sitewidePerDay;
  } catch (error) {
    console.error(`AI matching: rate-limit check failed: ${describeSupabaseError(error)}`);
    return false;
  }
}

async function logUsage(row: {
  userId: string | null;
  clientKey: string;
  outcome: Outcome;
  model: string | null;
  candidateCount: number;
  matchCount: number;
  promptTokens?: number;
  completionTokens?: number;
}) {
  try {
    const prices = getTokenPricesUsd();
    const cost =
      row.promptTokens != null && row.completionTokens != null
        ? (row.promptTokens * prices.input + row.completionTokens * prices.output) / 1_000_000
        : null;
    const { error } = await createServiceRoleClient()
      .from("ai_match_requests")
      .insert({
        user_id: row.userId,
        client_key_hash: row.clientKey,
        outcome: row.outcome,
        model: row.model,
        candidate_count: row.candidateCount,
        match_count: row.matchCount,
        prompt_tokens: row.promptTokens ?? null,
        completion_tokens: row.completionTokens ?? null,
        estimated_cost_usd: cost == null ? null : Math.round(cost * 1e6) / 1e6,
      });
    if (error) throw error;
  } catch (error) {
    console.error(`AI matching: usage log failed: ${describeSupabaseError(error)}`);
  }
}

/**
 * AI expert matching (V2, section 7). One model call at most per request:
 *
 *  1. validate the problem text (length, honeypot);
 *  2. keyword-score all published experts (cached) and keep the top
 *     MATCH_MAX_CANDIDATES, so the model never sees the whole platform;
 *  3. ask OpenAI to rank those few, using only their public summaries;
 *  4. keep only slugs that were actually offered (no invented experts).
 *
 * No key, an over-limit visitor, or any API failure falls back to the
 * keyword ranking, so matching (and the rest of the site) keeps working.
 */
export async function matchExpertsAction(_prev: MatchState, formData: FormData): Promise<MatchState> {
  const problem = String(formData.get("problem") ?? "")
    .replace(/\s+/g, " ")
    .trim();

  // Honeypot: real visitors never see or fill this field.
  if (String(formData.get("company_website") ?? "") !== "") {
    return { status: "error", error: "Something went wrong. Please try again.", problem };
  }
  if (problem.length < MATCH_PROBLEM_MIN_CHARS) {
    return { status: "error", error: "Please describe your situation in a sentence or two.", problem };
  }
  if (problem.length > MATCH_PROBLEM_MAX_CHARS) {
    return {
      status: "error",
      error: `Please keep it under ${MATCH_PROBLEM_MAX_CHARS} characters.`,
      problem: problem.slice(0, MATCH_PROBLEM_MAX_CHARS),
    };
  }

  let candidates;
  let directory: PublicDirectoryCard[];
  try {
    [candidates, directory] = await Promise.all([loadMatchCandidates(), getDirectoryForRequest()]);
  } catch (error) {
    console.error(`AI matching: ${describeSupabaseError(error)}`);
    return { status: "error", error: "We couldn't load our experts just now. Please try again.", problem };
  }

  const cardsBySlug = new Map(directory.map((card) => [card.slug, card]));
  const ranked = keywordRank(problem, candidates).filter((entry) => cardsBySlug.has(entry.candidate.slug));
  const shortlist = ranked.slice(0, MATCH_MAX_CANDIDATES);

  const keywordFallback = (notice: string): MatchState => ({
    status: "done",
    mode: "keyword",
    notice,
    problem,
    results: ranked
      .filter((entry) => entry.score > 0)
      .slice(0, MATCH_MAX_RESULTS)
      .map((entry) => ({
        expert: cardsBySlug.get(entry.candidate.slug)!,
        reason: `Their profile mentions: ${entry.matchedTerms.slice(0, 4).join(", ")}.`,
      })),
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const clientKey = await clientKeyHash();
  const base = { userId: user?.id ?? null, clientKey, candidateCount: shortlist.length };

  if (shortlist.length === 0) {
    return { status: "done", mode: "keyword", results: [], problem };
  }

  const apiKey = getOpenAIKey();
  if (!apiKey) {
    const state = keywordFallback("AI matching isn't switched on yet, so these are keyword matches.");
    await logUsage({ ...base, outcome: "fallback_no_key", model: null, matchCount: state.results!.length });
    return state;
  }

  if (await isOverLimit(clientKey)) {
    const state = keywordFallback("You've reached the AI matching limit for now, so these are keyword matches.");
    await logUsage({ ...base, outcome: "rate_limited", model: null, matchCount: state.results!.length });
    return state;
  }

  const model = getMatchModel();
  try {
    const result = await rankWithOpenAI({
      apiKey,
      model,
      problem,
      candidates: shortlist.map((entry) => entry.candidate),
    });

    const offered = new Set(shortlist.map((entry) => entry.candidate.slug));
    const seen = new Set<string>();
    const results: MatchResult[] = [];
    for (const match of result.matches) {
      if (!offered.has(match.slug) || seen.has(match.slug)) continue;
      seen.add(match.slug);
      results.push({ expert: cardsBySlug.get(match.slug)!, reason: String(match.reason).trim().slice(0, 280) });
      if (results.length >= MATCH_MAX_RESULTS) break;
    }

    await logUsage({
      ...base,
      outcome: "ai",
      model,
      matchCount: results.length,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    });
    return { status: "done", mode: "ai", results, problem };
  } catch (error) {
    console.error(`AI matching: OpenAI call failed: ${error instanceof Error ? error.message : String(error)}`);
    const state = keywordFallback("AI matching is unavailable right now, so these are keyword matches.");
    await logUsage({ ...base, outcome: "fallback_error", model, matchCount: state.results!.length });
    return state;
  }
}
