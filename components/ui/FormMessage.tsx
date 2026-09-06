type Props = {
  variant: "error" | "success";
  children: React.ReactNode;
};

export function FormMessage({ variant, children }: Props) {
  const styles =
    variant === "error"
      ? "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
      : "bg-[var(--color-success-bg)] text-[var(--color-success)]";

  return (
    <div role={variant === "error" ? "alert" : "status"} className={`rounded-md px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
