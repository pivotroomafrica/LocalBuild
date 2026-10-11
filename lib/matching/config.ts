/**
 * AI expert matching configuration (V2). Everything is server-only.
 *
 * OPENAI_API_KEY unset -> matching still works, using the keyword ranking
 * fallback, and the UI says so. Costs are ESTIMATES from the configured
 * per-million-token prices; check OpenAI's current pricing for the model.
 */
export function getOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function getMatchModel(): string {
  return process.env.OPENAI_MATCH_MODEL?.trim() || "gpt-4o-mini";
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** USD per 1M input / output tokens, used only for the usage log. */
export function getTokenPricesUsd() {
  return {
    input: numberEnv("OPENAI_MATCH_INPUT_USD_PER_MTOK", 0.15),
    output: numberEnv("OPENAI_MATCH_OUTPUT_USD_PER_MTOK", 0.6),
  };
}

/** Abuse limits: AI calls per visitor per hour, and per day site-wide.
 * Past either limit the visitor still gets keyword matches. */
export function getMatchLimits() {
  return {
    perClientPerHour: numberEnv("AI_MATCH_HOURLY_LIMIT_PER_CLIENT", 10),
    sitewidePerDay: numberEnv("AI_MATCH_DAILY_LIMIT", 500),
  };
}

export const MATCH_PROBLEM_MIN_CHARS = 15;
export const MATCH_PROBLEM_MAX_CHARS = 1000;
/** Experts sent to the model at most (pre-filtered by keyword score). */
export const MATCH_MAX_CANDIDATES = 15;
/** Experts shown to the customer at most. */
export const MATCH_MAX_RESULTS = 5;
