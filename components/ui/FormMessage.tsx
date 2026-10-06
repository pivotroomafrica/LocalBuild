type Props = {
  variant: "error" | "success";
  children: React.ReactNode;
};

export function FormMessage({ variant, children }: Props) {
  const styles =
    variant === "error"
      ? "border-[#fbd5d0] bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
      : "border-[#c6f0dc] bg-[var(--color-success-bg)] text-[var(--color-success)]";

  return (
    <div role={variant === "error" ? "alert" : "status"} className={`rounded-[var(--radius-input)] border px-4 py-3 text-sm font-medium ${styles}`}>
      {children}
    </div>
  );
}
