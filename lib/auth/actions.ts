"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

type Names = { first_name: string; middle_name: string | null; last_name: string; full_name: string };

/** First and last name required, middle optional; full_name is built from
 * them (it's the one name the rest of the app shows). */
function readNames(formData: FormData): Names | { error: string } {
  const clean = (key: string) => String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
  const first = clean("first_name");
  const middle = clean("middle_name");
  const last = clean("last_name");
  if (!first) return { error: "Enter your first name." };
  if (!last) return { error: "Enter your last name." };
  if (first.length > 50 || middle.length > 50 || last.length > 50) {
    return { error: "Each name must be 50 characters or fewer." };
  }
  const full = validateFullName([first, middle, last].filter(Boolean).join(" "));
  if (!full.valid) return { error: full.error };
  return { first_name: first, middle_name: middle || null, last_name: last, full_name: full.value };
}

/** The Terms and Privacy Policy box must be ticked to create an account. */
const acceptedTerms = (formData: FormData) => formData.get("accept_terms") === "on";

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
  const names = readNames(formData);
  if ("error" in names) return { error: names.error };
  if (!acceptedTerms(formData)) return { error: "Please agree to the Terms and Privacy Policy to create your account." };

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
      data: { ...names, phone: phoneResult.value, ...placeResult, terms_accepted: true },
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
  const names = readNames(formData);
  if ("error" in names) return { error: names.error };
  if (!acceptedTerms(formData)) return { error: "Please agree to the Terms and Privacy Policy to create your account." };

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
      data: { ...names, phone: phoneResult.value, ...placeResult, terms_accepted: true },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  if (!data.session) return { status: "check-email" };
  return { success: true };
}

/**
 * "Finish your profile": the details Google doesn't give us (phone,
 * country, city), a check of their name split into parts, and the Terms.
 * Shown once after a first Google sign-in.
 */
export async function completeProfileAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const names = readNames(formData);
  if ("error" in names) return { error: names.error };
  const phoneResult = validatePhone(String(formData.get("phone") ?? ""));
  if (!phoneResult.valid) return { error: phoneResult.error };
  const placeResult = readPlace(formData);
  if ("error" in placeResult) return { error: placeResult.error };
  if (!acceptedTerms(formData)) return { error: "Please agree to the Terms and Privacy Policy to continue." };

  const { error } = await supabase
    .from("profiles")
    .update({ ...names, phone: phoneResult.value, ...placeResult })
    .eq("id", user.id);
  if (error) return { error: "We couldn't save your details. Please try again." };

  const { error: termsError } = await supabase.rpc("accept_platform_terms");
  if (termsError) return { error: "We couldn't save your details. Please try again." };

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")) ?? (await homePathFor(supabase, user.id)));
}

/** Signs out and goes to the home page. */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
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
