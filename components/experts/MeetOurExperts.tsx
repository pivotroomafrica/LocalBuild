import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ExpertMarqueeRow } from "@/components/experts/ExpertMarqueeRow";
import { Reveal } from "@/components/marketing/Reveal";
import { chunkExperts, directionForRow } from "@/lib/experts/chunk";
import type { ExpertCardData } from "@/components/expert/ExpertCard";

// Desktop large / laptop / tablet / mobile, in that order (spec section
// 11) -- the SAME card component just gets a narrower box from here; it
// never squeezes its own internal layout to fit, it changes information
// density only through the `marquee` variant it always uses in this row.
// Two size tiers alternate by row (spec section 14: "create variation
// between expert rows... only alter visual rhythm," never information
// density) -- with today's roster this is a single row and invisible, but
// it's real, cheap architecture for when the roster grows past 10.
const CARD_WIDTH_TIERS = [
  "w-[175px] sm:w-[215px] lg:w-[260px] xl:w-[300px]",
  "w-[160px] sm:w-[196px] lg:w-[238px] xl:w-[272px]",
];

// Rows 1 normal, 2 slightly slower, 3 normal, ... -- a small, deliberately
// subtle organic variation (spec section 13), never enough to feel chaotic.
const BASE_SPEED_PX_PER_SECOND = 38;
const ALTERNATE_ROW_SPEED_PX_PER_SECOND = 33;

/**
 * "Meet Our Experts" -- organizes the homepage section: heading, the
 * dynamically-batched animated rows, the empty state, and the secondary
 * "View all experts" CTA. Owns none of the DATA (experts arrive already
 * fetched/filtered/ordered as a prop -- see app/(public)/page.tsx, which
 * reuses the existing getPublicExpertDirectory() published-only query,
 * one round trip for the whole section) and none of the ANIMATION (that
 * lives entirely in ExpertMarqueeRow) -- this component only decides how
 * many rows there are and what direction/speed each one gets.
 *
 * Rows are chunked dynamically via chunkExperts() -- there is no
 * hand-written row1/row2/row3; an 11th expert simply starts a second,
 * shorter row, and a 41st starts a fifth, with zero code changes.
 */
export function MeetOurExperts({ experts }: { experts: ExpertCardData[] }) {
  const rows = chunkExperts(experts);

  return (
    <section className="overflow-x-hidden py-20 sm:py-28 lg:py-36">
      <Container className="flex flex-col items-start gap-3">
        <Reveal>
          <h2 className="font-display text-[32px] font-bold leading-[1.08] tracking-[-0.015em] text-[var(--color-text)] sm:text-[42px] lg:text-[48px]">
            Meet our experts.
          </h2>
        </Reveal>
        <Reveal delayMs={100}>
          <p className="max-w-md text-base text-[var(--color-text-muted)]">
            People who&apos;ve already been where you&apos;re trying to go.
          </p>
        </Reveal>
      </Container>

      {rows.length === 0 ? (
        // Preserves this codebase's existing empty-state strategy (spec
        // section 25: a hidden section is equally valid, but this
        // product already has an intentional, tasteful message here) --
        // never an empty animated row, never a broken-looking gap.
        <Container className="mt-8">
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
            <p className="text-base font-medium text-[var(--color-text)]">No experts on Pivotroom yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
              We&apos;re adding people. Check back soon.
            </p>
          </div>
        </Container>
      ) : (
        <>
          <div className="mt-12 flex flex-col gap-4 sm:mt-14 sm:gap-6 lg:gap-8">
            {rows.map((rowExperts, rowIndex) => (
              <div key={rowIndex} className="px-5 sm:px-8 lg:px-16">
                <ExpertMarqueeRow
                  experts={rowExperts}
                  direction={directionForRow(rowIndex)}
                  speedPxPerSecond={
                    rowIndex % 2 === 0 ? BASE_SPEED_PX_PER_SECOND : ALTERNATE_ROW_SPEED_PX_PER_SECOND
                  }
                  cardWidthClassName={CARD_WIDTH_TIERS[rowIndex % CARD_WIDTH_TIERS.length]}
                />
              </div>
            ))}
          </div>

          <Container className="mt-8 sm:mt-10">
            <Link
              href="/experts"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              View all experts →
            </Link>
          </Container>
        </>
      )}
    </section>
  );
}
