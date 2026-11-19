"use server";

import { createClient } from "@/lib/supabase/server";
import { checkListedCity } from "@/lib/geo/cityCheck";
import { validateOptionalPhone } from "@/lib/validation/profile";
import { notifyWaitlistJoined } from "@/lib/notify/account";

export type WaitlistState = { error?: string; joined?: "joined" | "already"; name?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A client joins the waitlist (no account): join_waitlist() (070). */
export async function joinWaitlistAction(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  // Bots fill every field, including this hidden one.
  if (String(formData.get("website") ?? "").trim()) return { joined: "joined" };

  const name = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const interest = String(formData.get("interest") ?? "").trim().slice(0, 1000);

  if (!name) return { error: "Please enter your name." };
  if (name.length > 120) return { error: "Please shorten your name." };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Please enter a valid email address." };

  const phone = validateOptionalPhone(String(formData.get("phone") ?? ""));
  if (!phone.valid) return { error: phone.error };

  const city = await checkListedCity(country, String(formData.get("city") ?? ""));
  if ("error" in city) return { error: city.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_waitlist", {
    p_full_name: name,
    p_email: email,
    p_phone: phone.value ?? "",
    p_country: country,
    p_city: city.city ?? "",
    p_interest: interest,
  });
  if (error) {
    console.error("joinWaitlistAction:", error.message);
    return { error: "We couldn't add you just now. Please try again in a minute." };
  }
  const result = data === "already" ? "already" : "joined";
  if (result === "joined") notifyWaitlistJoined(email, name);
  return { joined: result, name: name.split(" ")[0] };
}
