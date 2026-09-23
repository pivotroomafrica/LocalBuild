import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicExpertDirectory } from "@/lib/public/data";
import { Container } from "@/components/ui/Container";
import { ExpertCard } from "@/components/expert/ExpertCard";

const HOME_PREVIEW_COUNT = 6;

/**
 * Home (Phase 12 workstream D). Expert-first: the hero states what
 * Pivotroom is in one sentence, then experts appear immediately below it
 * -- never a long company story before a face shows up (guideline
 * section 22/109). Auth-aware for the same reason PublicHeader is (see
 * that component's comment): this page reads cookies() via
 * createClient(), which opts it out of static prerendering, so a
 * logged-in visitor never sees the logged-out Sign Up/Log In CTAs again.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const experts = (await getPublicExpertDirectory(supabase)).slice(0, HOME_PREVIEW_COUNT);

  return (
    <div className="flex flex-col">
      <section className="bg-[var(--color-mist)] py-16 sm:py-20">
        <Container className="flex flex-col items-center text-center">
          <h1 className="font-display max-w-2xl text-4xl font-bold tracking-[-0.025em] text-[var(--color-text)] sm:text-5xl">
            Talk to someone who&apos;s already been there.
          </h1>
          <p className="mt-4 max-w-md text-base text-[var(--color-text-muted)]">
            Book one-to-one time with experienced professionals who&apos;ve navigated what
            you&apos;re facing now.
          </p>

          <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:flex-row">
            {user ? (
              <>
                <Link
                  href="/experts"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-brand)] px-7 text-sm font-medium text-[var(--color-on-brand)] transition-colors hover:bg-[var(--color-brand-hover)] sm:w-auto"
                >
                  Browse experts
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-7 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] sm:w-auto"
                >
                  Go to dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signup"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-brand)] px-7 text-sm font-medium text-[var(--color-on-brand)] transition-colors hover:bg-[var(--color-brand-hover)] sm:w-auto"
                >
                  Sign up
                </Link>
                <Link
                  href="/experts"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-7 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] sm:w-auto"
                >
                  Browse experts
                </Link>
              </>
            )}
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container className="flex flex-col gap-8">
          <h2 className="font-display text-2xl font-bold text-[var(--color-text)]">Experts on Pivotroom</h2>

          {experts.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
              <p className="text-base font-medium text-[var(--color-text)]">No experts on Pivotroom yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
                We&apos;re adding people. Check back soon.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {experts.map((expert) => (
                  <ExpertCard key={expert.slug} expert={expert} />
                ))}
              </div>
              <Link
                href="/experts"
                className="inline-flex w-fit items-center gap-1 text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-text-muted)]"
              >
                Browse all experts →
              </Link>
            </>
          )}
        </Container>
      </section>
    </div>
  );
}
