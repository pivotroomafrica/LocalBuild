type ExpertIdentity = {
  fullName: string;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
};

export function formatEtb(amount: number): string {
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
}

/** Two-letter initials for the photo placeholder ("Selamawit Girma" -> "SG"). */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

/** "Google Meet or in person" / "Google Meet" / "In person", with its icon. */
export function formatLine(expert: { onlineEnabled: boolean; inPersonEnabled: boolean }): {
  label: string;
  icon: string;
} | null {
  if (expert.onlineEnabled && expert.inPersonEnabled) return { label: "Google Meet or in person", icon: "videocam" };
  if (expert.onlineEnabled) return { label: "Google Meet", icon: "videocam" };
  if (expert.inPersonEnabled) return { label: "In person", icon: "person" };
  return null;
}

export function credibilityLine(expert: ExpertIdentity): string {
  return [expert.currentPosition, expert.currentCompany].filter(Boolean).join(" at ");
}

/** The one-line summary shown under a name: headline first, role second. */
export function summaryLine(expert: ExpertIdentity): string {
  return expert.headline || credibilityLine(expert);
}
