import { createClient } from "@/lib/supabase/server";
import { getPublicExpertDirectory } from "@/lib/public/data";
import { Container } from "@/components/ui/Container";
import { ExpertCard } from "@/components/expert/ExpertCard";

export const metadata = { title: "Browse experts — Pivotroom" };

export default async function ExpertDirectoryPage() {
  const supabase = await createClient();
  const experts = await getPublicExpertDirectory(supabase);

  return (
    <Container className="flex flex-col gap-10 py-10 sm:py-16">
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">Browse experts</h1>
        <p className="mt-2 max-w-xl text-base text-[var(--color-text-muted)]">
          Book one-to-one time with people who&apos;ve already done what you&apos;re trying to do.
        </p>
      </div>

      {experts.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
          <p className="text-base font-medium text-[var(--color-text)]">No experts on Pivotroom yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
            We&apos;re adding people. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {experts.map((expert) => (
            <ExpertCard key={expert.slug} expert={expert} />
          ))}
        </div>
      )}
    </Container>
  );
}
