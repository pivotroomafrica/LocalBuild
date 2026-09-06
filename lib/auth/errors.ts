/**
 * Maps raw Supabase Auth errors to plain, customer-facing copy. Supabase
 * error messages are not part of its stable API and are meant for
 * developers, so we never show them directly (see spec section 19/59).
 */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "The email or password you entered is incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return "Please verify your email before logging in. Check your inbox for the verification link.";
  }
  if (m.includes("user already registered") || m.includes("already registered")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (m.includes("password should be at least") || m.includes("password is too short")) {
    return "Password must be at least 8 characters.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("network") || m.includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }

  return "Something went wrong. Please try again.";
}
