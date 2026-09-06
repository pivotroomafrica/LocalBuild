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
      <label htmlFor={name} className="text-sm font-medium text-[var(--color-text)]">
        {label}
      </label>
      <select
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)] focus-visible:border-[var(--color-brand)] ${
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
