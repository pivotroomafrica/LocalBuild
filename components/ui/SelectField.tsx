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
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-[15px] font-medium text-[var(--color-text)]">
        {label}
      </label>
      <select
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-[var(--radius-input)] border border-[var(--color-mist)] bg-[var(--color-mist)] px-4 py-3 text-base text-[var(--color-text)] transition-colors focus-visible:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:border-[var(--color-accent)] ${
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
