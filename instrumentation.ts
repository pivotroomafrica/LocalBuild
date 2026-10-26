/** Starts the in-app job runner (lib/jobs/inProcess.ts) on the Node.js
 * server; jobsRunHere() decides whether this deployment should run it. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startJobLoop } = await import("@/lib/jobs/inProcess");
  startJobLoop();
}
