import type { SelectHTMLAttributes } from "react";

type Option = { value: string; label: string };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  options: Option[];
  placeholder?: string;
  error?: string;
};

export function SelectField({
  label,
  name,
  options,
  placeholder = "Select...",
  error,
  className = "",
  ...rest
}: Props) {
  const errorId = `${name}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-[13.5px] font-bold text-[var(--color-text)]">
        {label}
      </label>
      <select
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-[var(--radius-input)] border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[15px] text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(37,99,235,0.14)] focus-visible:border-[var(--color-accent)] ${
          error ? "border-[var(--color-danger)]" : ""
        } ${className}`}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
