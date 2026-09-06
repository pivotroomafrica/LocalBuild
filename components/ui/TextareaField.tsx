"use client";

import { useState, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

export function TextareaField({
  label,
  name,
  error,
  hint,
  maxLength,
  defaultValue,
  className = "",
  onChange,
  ...rest
}: Props) {
  const [length, setLength] = useState(String(defaultValue ?? "").length);
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={name} className="text-sm font-medium text-[var(--color-text)]">
          {label}
        </label>
        {maxLength ? (
          <span className="text-xs text-[var(--color-text-muted)]">
            {length}/{maxLength}
          </span>
        ) : null}
      </div>
      <textarea
        id={name}
        name={name}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        onChange={(event) => {
          setLength(event.target.value.length);
          onChange?.(event);
        }}
        className={`min-h-28 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-brand)] ${
          error ? "border-[var(--color-danger)]" : ""
        } ${className}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
