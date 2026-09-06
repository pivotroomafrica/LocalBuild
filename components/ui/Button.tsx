import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  isLoading?: boolean;
  loadingText?: string;
};

export function Button({
  variant = "primary",
  isLoading = false,
  loadingText = "Saving...",
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  const base =
    "inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]"
      : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]";

  return (
    <button
      className={`${base} ${styles} ${className}`}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? loadingText : children}
    </button>
  );
}
