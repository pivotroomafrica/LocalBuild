"use client";

import { useState, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

/** Labelled text input. Password fields get an eye button to show or hide what's typed. */
export function TextField({ label, name, error, hint, className = "", type, ...rest }: Props) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const isPassword = type === "password";
  const [shown, setShown] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-[15px] font-medium text-[var(--color-text)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={isPassword && shown ? "text" : type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`w-full rounded-[var(--radius-input)] border border-[var(--color-mist)] bg-[var(--color-mist)] px-4 py-3 text-base text-[var(--color-text)] transition-colors focus-visible:bg-[var(--color-surface)] focus-visible:outline-none placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-accent)] ${
            error ? "border-[var(--color-danger)]" : ""
          } ${isPassword ? "pr-12" : ""} ${className}`}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShown((value) => !value)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            aria-controls={name}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[var(--radius-input)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            <span className="ms" aria-hidden="true" style={{ fontSize: 22 }}>
              {shown ? "visibility_off" : "visibility"}
            </span>
          </button>
        ) : null}
      </div>
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
