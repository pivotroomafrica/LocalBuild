import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary";
  /** 52px hero size vs. the 48px default -- guideline section 09. */
  size?: "default" | "hero";
  isLoading?: boolean;
  loadingText?: string;
};

/**
 * Pill buttons against square-cornered cards (guideline section 09/03).
 * Height 48 (52 in a hero), radius full, padding-inline 28. Hover is a 4%
 * lightness shift baked into --color-brand-hover -- no scale-up, no
 * shadow bloom. Primary is Ink on light grounds and flips to white
 * automatically inside an `.on-ink` section (see globals.css) since both
 * read off the same --color-brand token.
 */
export function Button({
  variant = "primary",
  size = "default",
  isLoading = false,
  loadingText = "Saving...",
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  const base =
    "inline-flex w-full items-center justify-center gap-2 rounded-full px-7 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  const heightClass = size === "hero" ? "h-[52px]" : "h-12";
  const styles =
    variant === "primary"
      ? "bg-[var(--color-brand)] text-[var(--color-on-brand)] hover:bg-[var(--color-brand-hover)]"
      : variant === "secondary"
        ? "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
        : "bg-transparent text-[var(--color-text)] underline decoration-[var(--color-border)] underline-offset-4 hover:decoration-[var(--color-text)]";

  return (
    <button
      className={`${base} ${heightClass} ${styles} ${className}`}
      style={{ transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-brand)" }}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? loadingText : children}
    </button>
  );
}
