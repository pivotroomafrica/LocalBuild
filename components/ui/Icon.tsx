/**
 * The one icon family (guideline section 16): Material Symbols Outlined,
 * weight 400, sizes 18/20/24 only, self-hosted (app/fonts/
 * MaterialSymbolsOutlined.woff2, loaded in app/layout.tsx). Icons inherit
 * text colour by default -- pass className to set colour explicitly (e.g.
 * blue only when the icon reports a state: confirmed, live, vetted).
 *
 * Never used as a control without a label: every interactive usage must
 * either sit beside visible text or carry aria-label on the control that
 * wraps it. Decorative usage (e.g. beside a link's own visible text)
 * should set aria-hidden via the `decorative` prop.
 */
const SIZES = { 18: "text-[18px]", 20: "text-[20px]", 24: "text-[24px]" } as const;

type Props = {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
  decorative?: boolean;
};

export function Icon({ name, size = 24, className = "", decorative = true }: Props) {
  return (
    <span
      className={`material-symbols-outlined ${SIZES[size]} ${className}`}
      aria-hidden={decorative ? "true" : undefined}
    >
      {name}
    </span>
  );
}
