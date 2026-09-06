import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { CrossApplicantTestForm } from "./CrossApplicantTestForm";
import { SelfEscalationTestPanel } from "./SelfEscalationTestPanel";

/**
 * TEMPORARY LOCAL DEVELOPMENT ONLY.
 *
 * Manually verifies Phase 2 Row Level Security against a real logged-in
 * session, using the normal authenticated Supabase client (never a
 * service-role client, which would bypass RLS and prove nothing). Not
 * part of the Phase 2 product surface.
 *
 * DO NOT DEPLOY THIS ROUTE TO PRODUCTION. Delete this entire
 * app/dev/expert-rls-test/ directory (and the "/dev" entry in
 * PROTECTED_PREFIXES in lib/supabase/middleware.ts, if app/dev/rls-test/
 * has also been removed by then) once Phase 2 RLS has been manually
 * verified.
 */
export default async function ExpertRlsTestPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const expertProfile = await ensureExpertProfileDraft();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const ownProfileReadPass = Boolean(expertProfile);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <div className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
        <strong>TEMPORARY — LOCAL DEVELOPMENT ONLY.</strong> This route tests Phase 2 Row
        Level Security directly and must be deleted before any production deploy.
      </div>

      <div>
        <h1 className="text-xl font-semibold">Expert RLS Test</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Logged in as <span className="font-mono">{user.id}</span> ({user.email})
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold">Test 1 — own expert profile</h2>
        <p className={`font-mono text-sm ${ownProfileReadPass ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          OWN EXPERT PROFILE READ: {ownProfileReadPass ? "PASS" : "FAIL"}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Your expert_profiles.id: <span className="font-mono">{expertProfile.id}</span>
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold">Test 2 — another applicant&apos;s data</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Every query below runs as YOU, using the normal authenticated client — RLS should
          block all of it.
        </p>
        <CrossApplicantTestForm />
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold">Test 3 — self-escalation</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Attempts to self-approve, self-publish, and self-promote to expert/admin. Each
          write is expected to be silently reverted by the database.
        </p>
        <SelfEscalationTestPanel />
      </section>
    </div>
  );
}
