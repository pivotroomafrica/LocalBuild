import { Icon } from "@/components/ui/Icon";

/**
 * The "what are you trying to solve?" input (redesign spec section 8/36) --
 * used once in the hero and once in the final CTA, same component, only
 * the placeholder differs. Deliberately a plain GET <form> to /experts (no
 * client JS, no state): the query string IS the interaction, so this stays
 * a server component and works even before hydration. Submits to the SAME
 * page problem-discovery links use (see ProblemDiscovery + the `q` param
 * read in app/(public)/experts/page.tsx) -- one real destination, not a
 * decorative dead-end field (spec section 29/30: don't fake a feature).
 *
 * Focus state is pure CSS (:focus-within) -- a subtle border shift to the
 * one interactive accent colour already in the palette, never a glow ring.
 */
export function ProblemInput({ placeholder }: { placeholder: string }) {
  return (
    <form
      action="/experts"
      method="get"
      className="group flex w-full items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-6 pr-1.5 transition-colors focus-within:border-[var(--color-accent)]"
      style={{ transitionDuration: "var(--duration-base)", transitionTimingFunction: "var(--ease-brand)" }}
    >
      <input
        type="text"
        name="q"
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none sm:text-lg"
      />
      <button
        type="submit"
        aria-label="Search experts"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-[var(--color-on-brand)] transition-colors hover:bg-[var(--color-brand-hover)]"
        style={{ transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-brand)" }}
      >
        <Icon name="arrow_forward" size={20} className="text-current" decorative />
      </button>
    </form>
  );
}
