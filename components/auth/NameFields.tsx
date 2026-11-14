import { TextField } from "@/components/ui/TextField";

/** First, middle (optional) and last name -- used by every sign-up form
 * and the "Finish your profile" step. */
export function NameFields({
  defaults,
  stacked = false,
}: {
  defaults?: { first?: string | null; middle?: string | null; last?: string | null };
  /** One per row (narrow places like the booking card). */
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? "grid gap-3" : "grid gap-4 sm:grid-cols-3"}>
      <TextField
        label="First name"
        name="first_name"
        autoComplete="given-name"
        maxLength={50}
        defaultValue={defaults?.first ?? ""}
        required
      />
      <TextField
        label="Middle name"
        name="middle_name"
        autoComplete="additional-name"
        maxLength={50}
        defaultValue={defaults?.middle ?? ""}
        hint="Optional"
      />
      <TextField
        label="Last name"
        name="last_name"
        autoComplete="family-name"
        maxLength={50}
        defaultValue={defaults?.last ?? ""}
        required
      />
    </div>
  );
}
