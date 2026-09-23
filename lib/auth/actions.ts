"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/auth/errors";
import {
  validateFullName,
  validatePassword,
  validatePhone,
} from "@/lib/validation/profile";

export type AuthActionState = {
  error?: string;
  status?: "check-email" | "reset-email-sent";
};

async function siteOrigin() {
  const originHeader = (await headers()).get("origin");
  return originHeader ?? "http://localhost:3000";
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const fullNameResult = validateFullName(String(formData.get("full_name") ?? ""));
  if (!fullNameResult.valid) return { error: fullNameResult.error };

  const phoneResult = validatePhone(String(formData.get("phone") ?? ""));
  if (!phoneResult.valid) return { error: phoneResult.error };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const password = String(formData.get("password") ?? "");
  const passwordResult = validatePassword(password);
  if (!passwordResult.valid) return { error: passwordResult.error };

  const rawNext = String(formData.get("next") ?? "/dashboard/profile");
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard/profile";

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user() database trigger to populate the
      // new profiles row (see supabase/migrations/001_profiles.sql).
      data: { full_name: fullNameResult.value, phone: phoneResult.value },
      // Preserves the intended destination (e.g. /expert/application when
      // signup was reached via /become-an-expert) through the email
      // confirmation round-trip -- see app/auth/callback/route.ts.
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  // No session means Supabase is configured to require email confirmation
  // before sign-in. With confirmation disabled, signUp returns a session
  // immediately and the customer is already logged in.
  if (!data.session) {
    return { status: "check-email" };
  }

  redirect(next);
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard/profile");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: friendlyAuthError(error.message) };

  redirect(next.startsWith("/") ? next : "/dashboard/profile");
}

/**
 * Phase 12 (inline booking rail) -- the exact same signUp/signIn logic as
 * signUpAction/signInAction above, but returning state instead of calling
 * redirect(). The booking rail renders these inline (an overlay within the
 * SAME mounted expert-profile route, never a separate-looking login page)
 * specifically so a customer's in-progress duration/format/slot selection
 * -- plain useState in BookingRail, never persisted anywhere -- survives
 * authentication automatically: there is no navigation for it to be lost
 * across. Reuses the identical validators/error-mapping as the standalone
 * auth pages, which remain unchanged and still handle the non-rail
 * sign-in/sign-up flows exactly as before.
 */
export type RailAuthActionState = {
  error?: string;
  status?: "check-email";
  success?: boolean;
};

export async function signInForRailAction(
  _prevState: RailAuthActionState,
  formData: FormData,
): Promise<RailAuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: friendlyAuthError(error.message) };
  return { success: true };
}

export async function signUpForRailAction(
  _prevState: RailAuthActionState,
  formData: FormData,
): Promise<RailAuthActionState> {
  const fullNameResult = validateFullName(String(formData.get("full_name") ?? ""));
  if (!fullNameResult.valid) return { error: fullNameResult.error };

  const phoneResult = validatePhone(String(formData.get("phone") ?? ""));
  if (!phoneResult.valid) return { error: phoneResult.error };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const password = String(formData.get("password") ?? "");
  const passwordResult = validatePassword(password);
  if (!passwordResult.valid) return { error: passwordResult.error };

  // Where Supabase's own confirmation-email link lands this customer back
  // (only relevant if email confirmation is required -- see the no-session
  // branch below); the profile route is the correct destination since
  // that's the whole point of the inline rail, but the in-progress
  // selection itself cannot survive that particular round trip (the same
  // accepted limitation the standalone auth pages already have for their
  // own `next` targets).
  const rawNext = String(formData.get("next") ?? "/dashboard/profile");
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard/profile";

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullNameResult.value, phone: phoneResult.value },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  if (!data.session) return { status: "check-email" };
  return { success: true };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const origin = await siteOrigin();

  // Errors are intentionally not surfaced here beyond a generic message:
  // revealing whether an email exists is an account-enumeration risk.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  return { status: "reset-email-sent" };
}

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const passwordResult = validatePassword(password);
  if (!passwordResult.valid) return { error: passwordResult.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: passwordResult.value });

  if (error) return { error: friendlyAuthError(error.message) };

  redirect("/auth/login?reset=success");
}
