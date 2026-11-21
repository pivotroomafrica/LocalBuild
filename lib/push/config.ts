/**
 * Web push (VAPID) keys. Set in the server's environment:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (keep secret),
 *   VAPID_SUBJECT (optional, defaults to mailto:hello@pivotroom.africa).
 * Make a pair once with: npx web-push generate-vapid-keys
 * Without them, everything else works and push stays off.
 */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function vapidDetails(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { subject: process.env.VAPID_SUBJECT?.trim() || "mailto:hello@pivotroom.africa", publicKey, privateKey };
}

export const isPushConfigured = () => vapidDetails() !== null;
