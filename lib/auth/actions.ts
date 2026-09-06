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

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user() database trigger to populate the
      // new profiles row (see supabase/migrations/001_profiles.sql).
      data: { full_name: fullNameResult.value, phone: phoneResult.value },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard/profile`,
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  // No session means Supabase is configured to require email confirmation
  // before sign-in. With confirmation disabled, signUp returns a session
  // immediately and the customer is already logged in.
  if (!data.session) {
    return { status: "check-email" };
  }

  redirect("/dashboard/profile");
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
