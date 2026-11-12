/**
 * Thin OpenAI Responses API client (no SDK): one structured-JSON call with
 * a hard timeout. Server-only -- reads OPENAI_API_KEY and must never be
 * imported from a "use client" file.
 *
 * Callers always have a non-AI fallback, so every failure mode (no key,
 * timeout, HTTP error, refusal, unparseable output) comes back as
 * `{ ok: false }` rather than throwing.
 */

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

/** USD per million tokens, for the usage log's cost estimate. Reasoning
 * tokens are billed (and reported) as output tokens. */
const PRICE_PER_MILLION = { input: 0.2, output: 1.2 };

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type OpenAIJsonResult<T> =
  | { ok: true; value: T; model: string; inputTokens: number; outputTokens: number; costUsd: number }
  | { ok: false; reason: "no_key" | "error"; model: string; inputTokens?: number; outputTokens?: number };

type ResponsesApiBody = {
  status?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function openAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const cost = (inputTokens * PRICE_PER_MILLION.input + outputTokens * PRICE_PER_MILLION.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function openAIJson<T>({
  system,
  user,
  schemaName,
  schema,
  effort = "low",
  maxOutputTokens = 1500,
  timeoutMs = 8000,
}: {
  system: string;
  user: string;
  schemaName: string;
  /** JSON Schema for strict structured output (every property required,
   * additionalProperties: false). */
  schema: Record<string, unknown>;
  effort?: ReasoningEffort;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAIJsonResult<T>> {
  const model = openAIModel();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "no_key", model };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        reasoning: { effort },
        max_output_tokens: maxOutputTokens,
        store: false,
        text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("openAIJson: HTTP", response.status, (await response.text()).slice(0, 300));
      return { ok: false, reason: "error", model };
    }

    const body = (await response.json()) as ResponsesApiBody;
    const inputTokens = body.usage?.input_tokens ?? 0;
    const outputTokens = body.usage?.output_tokens ?? 0;
    const text = body.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;

    if (body.status !== "completed" || !text) {
      return { ok: false, reason: "error", model, inputTokens, outputTokens };
    }

    return {
      ok: true,
      value: JSON.parse(text) as T,
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(inputTokens, outputTokens),
    };
  } catch (error) {
    console.error("openAIJson: request failed", error instanceof Error ? error.message : error);
    return { ok: false, reason: "error", model };
  }
}
