type ExpertIdentity = {
  fullName: string;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
};

export function formatEtb(amount: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount)} ETB`;
}

export function credibilityLine(expert: ExpertIdentity): string {
  return [expert.currentPosition, expert.currentCompany].filter(Boolean).join(" at ");
}

/** The one-line summary shown under a name: headline first, role second. */
export function summaryLine(expert: ExpertIdentity): string {
  return expert.headline || credibilityLine(expert);
}

/** Name-only matching -- the search scope agreed for now, shared by every
 * search box on the public site so they never disagree with each other. */
export function matchesName(expert: { fullName: string }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || expert.fullName.toLowerCase().includes(needle);
}
