import type { MatchCandidate } from "./candidates";

const STOPWORDS = new Set(
  (
    "the and for with that this from have has had are was were will would could should about into your you our " +
    "they them their what which when where who how why can not but all any some more most very just also want " +
    "need help improve business company work make get like know there here been being does doing its it's i'm my me"
  ).split(" "),
);

/** Lower-cased content words of 3+ letters with common suffixes trimmed
 * ("distributors" -> "distributor", "selling" -> "sell"). Deliberately
 * crude: it only pre-sorts candidates and powers the no-AI fallback. */
export function contentTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = new Set<string>();
  for (const word of words) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    terms.add(word.replace(/(ing|ers|er|es|s|ed)$/u, "") || word);
  }
  return [...terms].filter((term) => term.length >= 3);
}

export type KeywordScore = { candidate: MatchCandidate; score: number; matchedTerms: string[] };

/** Cheap, deterministic relevance score used (a) to pre-select the few
 * experts sent to the model and (b) as the no-AI fallback ranking.
 * Category and headline hits weigh more than long free-text hits. */
export function keywordRank(problem: string, candidates: MatchCandidate[]): KeywordScore[] {
  const terms = contentTerms(problem);
  return candidates
    .map((candidate) => {
      const strong = `${candidate.categories.join(" ")} ${candidate.headline ?? ""}`.toLowerCase();
      const weak =
        `${candidate.role ?? ""} ${candidate.expertise ?? ""} ${candidate.helpsWith ?? ""} ${candidate.whoTheyHelp ?? ""}`.toLowerCase();
      let score = 0;
      const matchedTerms: string[] = [];
      for (const term of terms) {
        const inStrong = strong.includes(term);
        const inWeak = weak.includes(term);
        if (inStrong || inWeak) matchedTerms.push(term);
        if (inStrong) score += 3;
        if (inWeak) score += 1;
      }
      return { candidate, score, matchedTerms };
    })
    .sort((a, b) => b.score - a.score || a.candidate.fullName.localeCompare(b.candidate.fullName));
}
