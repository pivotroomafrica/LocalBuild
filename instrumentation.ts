/** Starts the in-app job runner (lib/jobs/inProcess.ts) on the Node.js
 * server. Set JOBS_IN_PROCESS=false to rely on an external cron only. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.JOBS_IN_PROCESS === "false" || process.env.INTEGRATIONS_MODE === "mock") return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { startJobLoop } = await import("@/lib/jobs/inProcess");
  startJobLoop();
}
