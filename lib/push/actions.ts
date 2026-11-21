"use server";

import { createClient } from "@/lib/supabase/server";
import { isPushConfigured } from "./config";
import { sendPushToUser } from "./send";

type Result = { error?: string; ok?: boolean };

type IncomingSubscription = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

/** Saves this device's push subscription for the signed-in user. */
export async function savePushSubscriptionAction(sub: IncomingSubscription, userAgent: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 2000 || !p256dh || !auth) {
    return { error: "That device couldn't be set up for notifications." };
  }

  // The same device re-subscribing (or after signing in as someone else)
  // replaces its old row.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint,
    p256dh: p256dh.slice(0, 200),
    auth: auth.slice(0, 100),
    user_agent: userAgent.slice(0, 400) || null,
  });
  if (error) {
    console.error("savePushSubscriptionAction:", error.message);
    return { error: "Notifications couldn't be turned on. Please try again." };
  }
  return { ok: true };
}

/** Removes this device's subscription. */
export async function removePushSubscriptionAction(endpoint: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !endpoint) return { ok: true };
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  return { ok: true };
}

/** Sends a test notification to the signed-in user's devices. */
export async function sendTestPushAction(): Promise<Result> {
  if (!isPushConfigured()) return { error: "Notifications aren't set up on the server yet." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };
  const sent = await sendPushToUser(user.id, {
    title: "Notifications are on",
    body: "This is how Pivotroom will tell you about bookings, changes and reminders.",
    url: "/dashboard",
    tag: "test",
  });
  return sent > 0 ? { ok: true } : { error: "We couldn't reach this device. Try turning notifications off and on again." };
}
