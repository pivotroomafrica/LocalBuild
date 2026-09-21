/** Same canonical app URL var Chapa already established (lib/chapa/config.ts)
 * -- read independently here rather than cross-importing from the Chapa
 * feature folder, but deliberately the SAME env var name, never a second
 * "APP_URL" (spec section 11 suggested APP_URL; this project already has
 * a canonical one). */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  return url.replace(/\/+$/, "");
}

/** Shared secret the worker route (spec sections 90, 91) requires on
 * every call -- whichever scheduler calls it (pg_cron+pg_net, Vercel
 * Cron, a manual curl for testing) must present this exact value. Never
 * trust an unauthenticated public call to a job-processing endpoint. */
export function getWorkerSecret(): string {
  const secret = process.env.INTEGRATION_WORKER_SECRET;
  if (!secret) throw new Error("INTEGRATION_WORKER_SECRET is not configured.");
  return secret;
}
