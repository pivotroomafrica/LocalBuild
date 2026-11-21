import type { CSSProperties } from "react";
import { HORIZONTAL, MARK, PRIMARY, aspect } from "@/lib/brand/logo";

/**
 * The Pivotroom.Africa logo (brand guidelines v1.0). Artwork lives in
 * lib/brand/logo.ts and is drawn in currentColor, so a colourway is just
 * `color` on this element (or a parent): ink #0D0F12, or white on ink.
 *
 * - "primary": Pivotr[mark]m.Africa. Default; 140px wide and up.
 * - "horizontal": [mark] Pivotroom.Africa. Small headers, under ~200px.
 * - "icon": the mark alone (24px and up).
 *
 * `size` is the rendered HEIGHT in px; width follows the artwork.
 */
type Variant = "primary" | "horizontal" | "icon";

type Props = {
  variant?: Variant;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name; pass "" when a parent already names it (e.g. a link). */
  label?: string;
};

export function BrandLogo({ variant = "primary", size = 28, className = "", style, label = "Pivotroom.Africa" }: Props) {
  const art = variant === "icon" ? MARK : variant === "horizontal" ? HORIZONTAL : PRIMARY;
  const height = variant === "icon" ? Math.max(size, 24) : size;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={art.viewBox}
      height={height}
      width={Math.round(height * aspect(art.viewBox))}
      className={className}
      style={{ display: "block", flex: "none", ...style }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      // Static artwork from lib/brand/logo.ts (no user input).
      dangerouslySetInnerHTML={{ __html: art.inner }}
    />
  );
}
