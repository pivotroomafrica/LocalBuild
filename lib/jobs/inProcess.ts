import { after } from "next/server";
import { runDueJobs } from "./worker";

/**
 * Runs the integration job queue (confirmation emails, Meet invites,
 * reminders, reschedule/cancel notices) from inside the app itself, so it
 * works on a host with no scheduler. An external cron calling
 * /api/jobs/process still works alongside it: claimJob() makes sure each
 * job runs once however many runners there are.
 */

const LOOP_MS = 60_000;
const state = globalThis as typeof globalThis & { __pivotroomJobLoop?: ReturnType<typeof setInterval> };

async function runQuietly() {
  try {
    await runDueJobs();
  } catch (error) {
    console.error("job runner:", error instanceof Error ? error.message : error);
  }
}

/** Started once per server process by instrumentation.ts. */
export function startJobLoop() {
  if (state.__pivotroomJobLoop) return;
  state.__pivotroomJobLoop = setInterval(runQuietly, LOOP_MS);
  state.__pivotroomJobLoop.unref?.();
}

/** Sends a booking's emails right after the response instead of waiting
 * for the next loop tick. Call after an action that queues jobs. */
export function kickJobs() {
  after(runQuietly);
}
