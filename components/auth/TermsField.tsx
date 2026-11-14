import Link from "next/link";

/** "I agree to the Terms and Privacy Policy" -- required to create an
 * account; the server checks it again. */
export function TermsField() {
  return (
    <label className="flex items-start gap-3 text-sm leading-snug text-[var(--color-text)]">
      <input
        type="checkbox"
        name="accept_terms"
        required
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        I agree to Pivotroom&apos;s{" "}
        <Link href="/terms" target="_blank" className="font-medium text-[var(--color-accent)] hover:underline">
          Terms &amp; Conditions
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="font-medium text-[var(--color-accent)] hover:underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}
