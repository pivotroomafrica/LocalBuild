/**
 * Flattens a Supabase/PostgREST error into a plain string for logging.
 * PostgrestError is an Error subclass, and Next's dev overlay renders it as
 * `{}` when it is passed to console.error directly -- hiding whether the
 * failure was a database error (code/hint) or a network drop
 * ("TypeError: fetch failed").
 */
export function describeSupabaseError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const { message, code, details, hint } = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  return [message, code ? `code=${code}` : null, details ? `details=${details}` : null, hint ? `hint=${hint}` : null]
    .filter(Boolean)
    .join(" | ");
}
