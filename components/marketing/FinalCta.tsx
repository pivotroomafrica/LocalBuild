import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ProblemInput } from "@/components/marketing/ProblemInput";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * The homepage's closing moment (spec section 36) -- deliberately not "a
 * generic colored rectangle saying Ready to get started?". Same
 * ProblemInput as the hero (different placeholder), a plain text link
 * below it, nothing else -- the restrained footer follows immediately.
 */
export function FinalCta() {
  return (
    <section className="py-20 sm:py-28 lg:py-36">
      <Container className="flex flex-col items-start">
        <Reveal>
          <h2 className="font-display max-w-lg text-[32px] font-bold leading-[1.1] tracking-[-0.015em] text-[var(--color-text)] sm:text-[42px] lg:text-[48px]">
            Who do you need
            <br />
            in the room?
          </h2>
        </Reveal>

        <Reveal delayMs={100} className="mt-9 w-full max-w-md">
          <ProblemInput placeholder="Describe what you're working on" />
        </Reveal>

        <Reveal delayMs={150}>
          <Link
            href="/experts"
            className="mt-7 text-sm font-medium text-[var(--color-text)] underline decoration-[var(--color-border)] underline-offset-4 transition-colors hover:decoration-[var(--color-text)]"
          >
            Browse all experts
          </Link>
        </Reveal>
      </Container>
    </section>
  );
}
