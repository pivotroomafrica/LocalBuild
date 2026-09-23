import type { CSSProperties } from "react";

/**
 * The Pivotroom mark (guideline section 01-04): two half-discs and the
 * gap between them -- a circle of radius 22 on a 48-unit grid, split by a
 * vertical slit of 4 units centred on the axis. This path data is the
 * exact construction extracted from the brand guideline document itself
 * (its own loading-state thumbnail embeds this SVG verbatim), not an
 * approximation -- reproduced here at native scale (viewBox 0 0 48 48)
 * instead of the guideline's incidental 300x300 thumbnail framing.
 *
 * fill="currentColor" so the three approved colourways (white on ink,
 * ink on light, single-colour knockout) are just a `color` on the
 * wrapping element -- never a second SVG variant (misuse rule: don't
 * recolour arbitrarily, but the three specified colourways are exactly
 * this mechanism).
 *
 * Wordmark is Satoshi Bold, tracking -0.035em, sentence case, always one
 * word, rendered as text (not reset/retyped per lockup) -- "once
 * released it is a fixed asset," so this component is the only place
 * that ever renders it.
 */
function Mark({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} fill="currentColor" aria-hidden="true">
      <path d="M22 2.1A22 22 0 0 0 22 45.9Z" />
      <path d="M26 2.1A22 22 0 0 0 26 45.9Z" transform="translate(48,0) scale(-1,1)" />
    </svg>
  );
}

function Wordmark({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={`font-display font-bold tracking-[-0.035em] ${className}`} style={style}>
      Pivotroom
    </span>
  );
}

type Variant = "horizontal" | "stacked" | "icon" | "wordmark";

type Props = {
  variant?: Variant;
  /** Icon/wordmark size in px -- clearspace (guideline section 04) is
   * measured in multiples of this. Default 28 suits a header; the icon
   * itself never renders below 24px (misuse rule: no small-size variant
   * needed, the slit holds at 2px down to 24px). */
  size?: number;
  className?: string;
};

export function BrandLogo({ variant = "horizontal", size = 28, className = "" }: Props) {
  if (variant === "icon") {
    return <Mark className={className} style={{ width: size, height: size }} />;
  }
  if (variant === "wordmark") {
    return (
      <Wordmark className={className} style={{ fontSize: size * 0.82 } as React.CSSProperties} />
    );
  }
  const gap = variant === "stacked" ? "gap-1.5 flex-col" : "gap-2.5 flex-row items-center";
  return (
    <span className={`inline-flex ${gap} ${className}`}>
      <Mark style={{ width: size, height: size }} />
      <Wordmark style={{ fontSize: size * 0.82 } as React.CSSProperties} />
    </span>
  );
}
