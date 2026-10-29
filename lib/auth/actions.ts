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
import { homePathFor, safeNext } from "@/lib/auth/home";
import { siteUrl } from "@/lib/site";

export type AuthActionState = {
  error?: string;
  status?: "check-email" | "reset-email-sent";
};

/** The address email links point back to: the deployment's own URL
 * (e.g. https://pivotroom.africa), then the browser's origin, and
 * localhost only in local development. */
async function siteOrigin() {
  const configured = siteUrl();
  if (configured) return configured;
  const originHeader = (await headers()).get("origin");
  return originHeader ?? "http://localhost:3000";
}

/** Country and city from CountryCityFields; both required at sign-up. */
function readPlace(formData: FormData): { country: string; city: string } | { error: string } {
  const country = String(formData.get("country") ?? "").trim().slice(0, 100);
  const city = String(formData.get("city") ?? "").trim().slice(0, 100);
  if (!country) return { error: "Choose your country." };
  if (!city) return { error: "Enter your city." };
  return { country, city };
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

  const placeResult = readPlace(formData);
  if ("error" in placeResult) return { error: placeResult.error };

  const next = safeNext(formData.get("next")) ?? "/dashboard";

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user() database trigger to populate the
      // new profiles row (see supabase/migrations/001_profiles.sql).
      data: { full_name: fullNameResult.value, phone: phoneResult.value, ...placeResult },
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
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: friendlyAuthError(error.message) };

  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut();
    return { error: "Please confirm your email first. Open the link we sent you, then sign in." };
  }

  // A page they were sent from wins; otherwise their own dashboard.
  redirect(next ?? (await homePathFor(supabase, data.user.id)));
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

  const placeResult = readPlace(formData);
  if ("error" in placeResult) return { error: placeResult.error };

  // Where Supabase's own confirmation-email link lands this customer back
  // (only relevant if email confirmation is required -- see the no-session
  // branch below); the profile route is the correct destination since
  // that's the whole point of the inline rail, but the in-progress
  // selection itself cannot survive that particular round trip (the same
  // accepted limitation the standalone auth pages already have for their
  // own `next` targets).
  const next = safeNext(formData.get("next")) ?? "/dashboard";

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullNameResult.value, phone: phoneResult.value, ...placeResult },
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

/** Sign out, then sign in again and return to `next` (e.g. a session link
 * from an email that belongs to a different account). */
export async function switchAccountAction(formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const next = safeNext(formData.get("next"));
  redirect(next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login");
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
