import { getDueJobs, claimJob, completeJob, failJobWithRetry, type IntegrationJobRow } from "./data";
import { runJobHandler } from "./handlers";

export type WorkerRunSummary = {
  claimed: number;
  completed: number;
  failed: number;
  skipped: number;
};

/**
 * One worker pass: fetch due jobs, claim + run each one, record the
 * outcome. Called from the protected /api/jobs/process route (spec
 * sections 90, 91) -- never runs inside the confirmation transaction
 * (spec section 6), always a separate HTTP call after that transaction
 * already committed.
 */
export async function runDueJobs(): Promise<WorkerRunSummary> {
  const summary: WorkerRunSummary = { claimed: 0, completed: 0, failed: 0, skipped: 0 };
  const dueJobs = await getDueJobs();

  for (const job of dueJobs) {
    const claimed = await claimJob(job.id);
    if (!claimed) {
      // Another concurrent worker run already claimed this one.
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;
    await processClaimedJob(job);
  }

  // Re-fetch outcome counts is unnecessary for a single-pass summary --
  // processClaimedJob updates `summary` via the closures below instead.
  return summary;

  async function processClaimedJob(job: IntegrationJobRow) {
    try {
      const result = await runJobHandler(job);
      if (result.ok) {
        await completeJob(job.id, result.providerId);
        summary.completed += 1;
      } else {
        await failJobWithRetry(job.id, job.attempt_count, result.error);
        summary.failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown job handler error.";
      await failJobWithRetry(job.id, job.attempt_count, message);
      summary.failed += 1;
    }
  }
}
