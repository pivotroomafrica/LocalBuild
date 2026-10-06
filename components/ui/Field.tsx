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
  const valueClass = `mt-1 text-[14.5px] font-medium text-[var(--color-text)] ${tabular ? "tabular-nums-brand" : ""}`;
  if (block) {
    return (
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{label}</dt>
        <dd className={`whitespace-pre-wrap ${valueClass}`}>{value}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{label}</dt>
      <dd className={valueClass}>{value}</dd>
    </div>
  );
}
