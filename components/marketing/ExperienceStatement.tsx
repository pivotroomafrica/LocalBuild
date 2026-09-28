import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/marketing/Reveal";

type Props = {
  /** "light" is the quiet philosophical transition right after the hero
   * (spec section 9); "dark" is used exactly ONCE, later on the page, for
   * the one deliberate ink-ground moment (spec section 24 -- "do not
   * alternate dark/light every section, one dark moment has more
   * impact"). Same component, two tones, so there's one place that owns
   * "a single big editorial statement" rather than two near-duplicates. */
  tone: "light" | "dark";
  /** Each string is its own line -- an intentional break, never CSS-wrapped
   * prose (spec section 4: "headings should often contain intentional
   * line breaks"). */
  lines: string[];
  sublabel?: string;
};

export function ExperienceStatement({ tone, lines, sublabel }: Props) {
  const dark = tone === "dark";
  return (
    <section className={`${dark ? "on-ink" : ""} py-24 sm:py-32 lg:py-40`}>
      <Container>
        <Reveal>
          {dark ? <span className="mb-7 block h-[3px] w-10 bg-[var(--color-accent-on-ink)]" /> : null}
          <p
            className={`font-display max-w-3xl text-[32px] font-bold leading-[1.15] tracking-[-0.015em] sm:text-[44px] lg:text-[56px] ${
              dark ? "text-white" : "text-[var(--color-text)]"
            }`}
          >
            {lines.map((line, index) => (
              <span key={line}>
                {line}
                {index < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
          {sublabel ? (
            <p
              className={`mt-5 max-w-sm text-sm sm:text-base ${
                dark ? "text-[var(--color-slate-dark)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              {sublabel}
            </p>
          ) : null}
        </Reveal>
      </Container>
    </section>
  );
}
