/**
 * Label/value pair for read-only detail views (session/booking/payment/
 * application detail pages). Phase 12: promoted out of five separate
 * copy-pasted inline `Field` helpers (dashboard, expert, and admin
 * session/booking/payment/application detail pages all hand-rolled the
 * same markup) into the one shared component the rest of the design
 * system already expects.
 */
export function Field({
  label,
  value,
  block = false,
  tabular = false,
}: {
  label: string;
  value: string;
  block?: boolean;
  tabular?: boolean;
}) {
  const valueClass = `text-sm text-[var(--color-text)] ${tabular ? "tabular-nums-brand" : ""}`;
  if (block) {
    return (
      <div>
        <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
        <dd className={`mt-1 whitespace-pre-wrap ${valueClass}`}>{value}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
      <dd className={valueClass}>{value}</dd>
    </div>
  );
}
