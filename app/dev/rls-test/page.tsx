import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RlsTestForm } from "./RlsTestForm";

/**
 * TEMPORARY LOCAL DEVELOPMENT ONLY.
 *
 * This route exists to manually verify Row Level Security against a real
 * logged-in session, using the normal authenticated Supabase client (never
 * a service-role client, which would bypass RLS and prove nothing). It is
 * not part of the Phase 1 product surface.
 *
 * DO NOT DEPLOY THIS ROUTE TO PRODUCTION. Delete this entire app/dev/
 * directory (and the "/dev" entry in PROTECTED_PREFIXES in
 * lib/supabase/middleware.ts) once RLS has been manually verified.
 */
export default async function RlsTestPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already protects everything under /dev; this is defense in
  // depth, matching the pattern used on /dashboard/profile.
  if (!user) redirect("/auth/login");

  const { data: ownProfile, error: ownProfileError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: ownCustomerProfile } = await supabase
    .from("customer_profiles")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const ownProfileReadPass = Boolean(ownProfile) && !ownProfileError;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <div className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
        <strong>TEMPORARY — LOCAL DEVELOPMENT ONLY.</strong> This route tests
        Row Level Security directly and must be deleted (this whole
        app/dev/ directory) before any production deploy.
      </div>

      <div>
        <h1 className="text-xl font-semibold">RLS Test</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Logged in as <span className="font-mono">{user.id}</span> ({user.email})
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold">Test 1 — own rows</h2>
        <p className={`font-mono text-sm ${ownProfileReadPass ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          OWN PROFILE READ: {ownProfileReadPass ? "PASS" : "FAIL"}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          profiles.full_name = {ownProfile?.full_name ?? "(not found)"} · customer_profiles row{" "}
          {ownCustomerProfile ? "exists" : "does not exist yet (fine — it's optional)"}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold">Test 2 — another customer&apos;s rows</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Paste another test customer&apos;s <code>profiles.id</code> (their auth user UUID).
          Every query below runs as YOU, using the normal authenticated client — RLS should
          block all of it.
        </p>
        <RlsTestForm />
      </section>
    </div>
  );
}
