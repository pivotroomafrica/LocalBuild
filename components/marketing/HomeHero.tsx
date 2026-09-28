import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ProblemInput } from "@/components/marketing/ProblemInput";
import { ExpertConstellation, type ConstellationExpert } from "@/components/marketing/ExpertConstellation";

type Props = {
  isLoggedIn: boolean;
  experts: ConstellationExpert[];
};

const ctaClasses =
  "inline-flex h-12 items-center justify-center rounded-full px-7 text-sm font-medium transition-colors";

/**
 * Editorial hero (redesign spec section 7): not headline/paragraph/two-
 * buttons/screenshot -- a 12-column asymmetric split. Left (columns 1-6 on
 * desktop) carries the whole verbal argument: a two-line statement with an
 * intentional break, one supporting line, the problem-first search input,
 * and two restrained CTAs. Right (columns 7-12) is pure visual -- the real-
 * expert ExpertConstellation, no caption, no card chrome around it. On
 * mobile the two stack (constellation second, smaller, per spec section
 * 28) rather than the right column just collapsing underneath at full
 * size.
 */
export function HomeHero({ isLoggedIn, experts }: Props) {
  return (
    <section className="overflow-x-hidden pb-20 pt-14 sm:pb-28 sm:pt-20 lg:pb-36 lg:pt-24">
      <Container>
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col items-start lg:col-span-6">
            <h1 className="font-display max-w-lg text-[44px] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--color-text)] sm:text-6xl lg:text-[68px]">
              Talk to someone
              <br />
              who&apos;s already been there.
            </h1>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-[var(--color-text-muted)] sm:text-lg">
              Access experienced founders, executives and operators for focused 1:1 conversations about the
              problems you&apos;re actually facing.
            </p>

            <div className="mt-9 w-full max-w-md">
              <ProblemInput placeholder="What are you trying to solve?" />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-5">
              <Link
                href={isLoggedIn ? "/experts" : "/auth/signup"}
                className={`${ctaClasses} bg-[var(--color-brand)] text-[var(--color-on-brand)] hover:bg-[var(--color-brand-hover)]`}
              >
                {isLoggedIn ? "Find an expert" : "Sign up"}
              </Link>
              <Link
                href="/experts"
                className="text-sm font-medium text-[var(--color-text)] underline decoration-[var(--color-border)] underline-offset-4 transition-colors hover:decoration-[var(--color-text)]"
              >
                Explore experts
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <ExpertConstellation experts={experts} />
          </div>
        </div>
      </Container>
    </section>
  );
}
