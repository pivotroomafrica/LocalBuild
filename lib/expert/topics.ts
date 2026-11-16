import { createServiceRoleClient } from "@/lib/supabase/service";
import { openAIJson, type OpenAIJsonResult } from "@/lib/ai/openai";
import { CATEGORY_TOPICS } from "@/lib/site/topics";

/** At most this many topics per expert (also a check constraint, 064). */
export const MAX_EXPERT_TOPICS = 12;

/** The topic choices for these areas: only topics under the expert's own
 * categories can ever be assigned. */
export function topicChoices(categoryNames: string[]): string[] {
  return Array.from(new Set(categoryNames.flatMap((name) => CATEGORY_TOPICS[name] ?? [])));
}

const STOP = new Set([
  "and",
  "the",
  "for",
  "with",
  "your",
  "from",
  "into",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "mentors",
]);
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/** Words too common to tell topics apart ("Building a sales team" must not
 * match just because someone wrote "building"). */
const GENERIC = new Set([
  "building",
  "business",
  "team",
  "company",
  "management",
  "strategy",
  "review",
  "first",
  "customer",
  "market",
]);

/** Without AI: a topic counts when most of its distinctive words appear in
 * what the expert wrote (e.g. "fundraising" in "I helped three startups
 * with fundraising"). Conservative on purpose: better too few than wrong. */
export function matchTopicsByWords(choices: string[], text: string): string[] {
  const said = new Set(words(text));
  // Also match simple plurals/singulars ("partnership" ~ "partnerships").
  const hit = (w: string) => said.has(w) || said.has(`${w}s`) || (w.endsWith("s") && said.has(w.slice(0, -1)));
  return choices
    .filter((topic) => {
      const key = words(topic).filter((w) => !GENERIC.has(w));
      const found = key.filter(hit).length;
      return found > 0 && found >= Math.ceil(key.length / 2);
    })
    .slice(0, MAX_EXPERT_TOPICS);
}

/**
 * Works out which topics an expert helps with, from what they already told
 * the onboarding (never a separate step for them). The AI may only choose
 * from `choices`; anything else it returns is dropped. Falls back to word
 * matching when AI isn't configured or fails. Never throws.
 */
export async function pickTopics(
  choices: string[],
  profileText: string,
  allowAI = true,
): Promise<{ topics: string[]; source: "ai" | "words"; ai?: OpenAIJsonResult<unknown> }> {
  if (choices.length === 0) return { topics: [], source: "words" };
  let ai: OpenAIJsonResult<unknown> | undefined;
  if (allowAI)
    try {
      const result = await openAIJson<{ topics: string[] }>({
        system:
          "Pivotroom is a marketplace in Ethiopia where people book paid 1:1 advice sessions with experienced professionals. " +
          "Pick the topics this expert can clearly help with, judging only from their own profile. " +
          `Choose ONLY from the given list, copied exactly. Pick between 3 and ${MAX_EXPERT_TOPICS}; fewer if the profile only supports fewer. ` +
          "Do not guess beyond what the profile says.",
        user: `Topic list:\n${choices.map((c) => `- ${c}`).join("\n")}\n\nExpert profile:\n${profileText}`,
        schemaName: "expert_topics",
        schema: {
          type: "object",
          properties: { topics: { type: "array", items: { type: "string" } } },
          required: ["topics"],
          additionalProperties: false,
        },
        maxOutputTokens: 600,
      });
      ai = result;
      if (result.ok) {
        const allowed = new Set(choices);
        const picked = Array.isArray(result.value?.topics) ? result.value.topics : [];
        const topics = Array.from(new Set(picked.filter((t) => allowed.has(t)))).slice(0, MAX_EXPERT_TOPICS);
        if (topics.length > 0) return { topics, source: "ai", ai };
      }
    } catch (error) {
      console.error("pickTopics: AI failed, using word match", error);
    }
  return { topics: matchTopicsByWords(choices, profileText), source: "words", ai };
}

/**
 * Saves the expert's topics with the service role (experts have no UPDATE
 * grant on this column, 064). Quietly does nothing when the service key
 * isn't configured. Never throws.
 */
export async function saveExpertTopics(expertProfileId: string, topics: string[]): Promise<void> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service
      .from("expert_profiles")
      .update({ topics: topics.slice(0, MAX_EXPERT_TOPICS) })
      .eq("id", expertProfileId);
    if (error) console.error("saveExpertTopics: update failed", error.message);
  } catch (error) {
    console.error("saveExpertTopics: service client unavailable", error);
  }
}

/**
 * Re-works out one expert's topics from their saved profile (headline, role,
 * the "what you've solved" texts) and their saved areas, then stores them.
 * Called after any save of those fields: AI onboarding, the classic form,
 * and the admin editor. Never throws; returns the AI call for usage logging.
 */
export async function refreshExpertTopics(
  expertProfileId: string,
  allowAI = true,
): Promise<OpenAIJsonResult<unknown> | undefined> {
  try {
    const service = createServiceRoleClient();
    const [{ data: profile }, { data: links }] = await Promise.all([
      service
        .from("expert_profiles")
        .select(
          "headline, current_position, current_company, problems_help_with, who_i_help, short_bio, expertise_summary, career_highlights",
        )
        .eq("id", expertProfileId)
        .maybeSingle(),
      service.from("expert_profile_categories").select("expert_categories(name)").eq("expert_profile_id", expertProfileId),
    ]);
    if (!profile) return undefined;
    const names = (links ?? [])
      .map((row) => (row.expert_categories as { name: string } | null)?.name)
      .filter((name): name is string => Boolean(name));
    const text = [
      profile.headline,
      [profile.current_position, profile.current_company].filter(Boolean).join(" at "),
      profile.problems_help_with,
      profile.who_i_help,
      profile.short_bio,
      profile.expertise_summary,
      profile.career_highlights,
    ]
      .filter(Boolean)
      .join("\n");
    const { topics, ai } = await pickTopics(topicChoices(names), text, allowAI);
    await saveExpertTopics(expertProfileId, topics);
    return ai;
  } catch (error) {
    console.error("refreshExpertTopics: skipped", error);
    return undefined;
  }
}
